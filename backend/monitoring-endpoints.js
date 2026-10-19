/**
 * Monitoring Endpoints
 * Expose performance metrics and feature flags via REST API
 * 
 * Endpoints:
 * - GET /api/monitoring/health - System health status
 * - GET /api/monitoring/metrics - Performance metrics summary
 * - GET /api/monitoring/endpoints - Per-endpoint metrics
 * - GET /api/monitoring/alerts - Recent alerts
 * - GET /api/features - Current feature flag status
 * - POST /api/features/:flag/rollout - Update feature flag rollout
 */

const featureFlags = require('./feature-flags');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

function registerMonitoringEndpoints(app, performanceMonitor) {
    // Public health check (no auth required)
    app.get('/health', (req, res) => {
        res.json({ 
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    });

    // VPS Monitoring Stats - For the monitoring dashboard
    app.get('/api/monitoring/stats', async (req, res) => {
        try {
            const cpus = os.cpus();
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            const uptime = os.uptime();

            // Get disk usage (attempt to get root disk)
            let diskUsed = 0;
            let diskTotal = 1;
            try {
                if (process.platform === 'win32') {
                    // Windows disk usage
                    const { stdout } = await execAsync('wmic logicaldisk get size,freespace /format:csv');
                    const lines = stdout.trim().split('\n').filter(l => l);
                    if (lines.length > 1) {
                        const parts = lines[1].split(',');
                        diskTotal = parseInt(parts[2]) || 1;
                        diskUsed = diskTotal - (parseInt(parts[1]) || 0);
                    }
                } else {
                    // Unix/Linux disk usage for root partition
                    const { stdout } = await execAsync('df / | tail -1');
                    const parts = stdout.trim().split(/\\s+/);
                    diskTotal = parseInt(parts[1]) * 1024; // Convert to bytes
                    diskUsed = parseInt(parts[2]) * 1024;
                }
            } catch (diskError) {
                console.warn('Could not get disk stats:', diskError.message);
            }

            // Get network stats
            const networkInterfaces = os.networkInterfaces();
            let networkIn = 0;
            let networkOut = 0;

            // Try to read from /proc/net/dev on Linux
            if (process.platform !== 'win32') {
                try {
                    const { stdout } = await execAsync('cat /proc/net/dev | grep -E "eth|wlan|ens" | awk \'{sum1+=$2; sum2+=$10} END {print sum1, sum2}\'');
                    const [inBytes, outBytes] = stdout.trim().split(' ').map(Number);
                    networkIn = inBytes || 0;
                    networkOut = outBytes || 0;
                } catch (netError) {
                    console.warn('Could not get network stats:', netError.message);
                }
            }

            res.json({
                cpu: {
                    usage: os.loadavg()[0] * 100 / cpus.length, // Load average as percentage
                    cores: cpus.length,
                    model: cpus[0]?.model || 'Unknown'
                },
                memory: {
                    used: usedMem,
                    total: totalMem,
                    free: freeMem
                },
                disk: {
                    used: diskUsed,
                    total: diskTotal,
                    free: diskTotal - diskUsed
                },
                uptime: uptime,
                network: {
                    in: networkIn,
                    out: networkOut
                },
                backend: {
                    status: 'online',
                    responseTime: 0,
                    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
                },
                processes: [], // Optional: could be populated from process manager data
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error collecting monitoring stats:', error);
            res.status(500).json({
                error: 'Failed to collect monitoring statistics',
                message: error.message
            });
        }
    });

    // Backend logs endpoint - returns real-time logs from global.backendLogs
    app.get('/api/monitoring/logs', (req, res) => {
        const limit = parseInt(req.query.limit) || 100;
        
        // Return recent backend logs from global buffer
        const allLogs = global.backendLogs || [];
        const logs = allLogs.slice(-limit);
        
        res.json({
            logs: logs,
            total: allLogs.length,
            timestamp: new Date().toISOString()
        });
    });

    // Health status with metrics
    app.get('/api/monitoring/health', (req, res) => {
        const summary = performanceMonitor.getSummary();
        res.json({
            health: summary.health,
            timestamp: summary.timestamp,
            uptime: process.uptime(),
            requests: summary.requests,
            performance: summary.performance,
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
            }
        });
    });

    // Full metrics summary
    app.get('/api/monitoring/metrics', (req, res) => {
        const summary = performanceMonitor.getSummary();
        res.json(summary);
    });

    // Per-endpoint metrics
    app.get('/api/monitoring/endpoints', (req, res) => {
        const metrics = performanceMonitor.getAllEndpointMetrics();
        
        // Sort by average duration (slowest first)
        const sorted = Object.values(metrics)
            .sort((a, b) => parseFloat(b.avgDuration) - parseFloat(a.avgDuration));

        res.json({
            endpoints: sorted,
            total: Object.keys(metrics).length
        });
    });

    // Recent alerts
    app.get('/api/monitoring/alerts', (req, res) => {
        const limit = parseInt(req.query.limit) || 50;
        const level = req.query.level;  // 'info', 'warning', 'critical'

        let alerts = performanceMonitor.alerts;

        if (level) {
            alerts = alerts.filter(a => a.level === level);
        }

        res.json({
            alerts: alerts.slice(-limit),
            total: performanceMonitor.alerts.length
        });
    });

    // Feature flags status
    app.get('/api/features', (req, res) => {
        const flags = featureFlags.getAllFlags();
        res.json({
            flags,
            timestamp: new Date().toISOString()
        });
    });

    // Get specific feature flag status
    app.get('/api/features/:flagName', (req, res) => {
        const { flagName } = req.params;
        const flags = featureFlags.getAllFlags();

        if (!flags[flagName]) {
            return res.status(404).json({
                error: `Feature flag '${flagName}' not found`
            });
        }

        res.json({
            flag: flagName,
            ...flags[flagName],
            timestamp: new Date().toISOString()
        });
    });

    // Update feature flag rollout (admin only)
    app.post('/api/features/:flagName/rollout', async (req, res) => {
        // Allow without auth for testing/internal use (phase activation)
        // In production, this should require proper admin authentication
        
        const { flagName } = req.params;
        const { percentage } = req.body;

        if (percentage === undefined) {
            return res.status(400).json({
                error: 'Missing percentage parameter'
            });
        }

        if (percentage < 0 || percentage > 100) {
            return res.status(400).json({
                error: 'Percentage must be between 0 and 100'
            });
        }

        const success = featureFlags.setRolloutPercentage(flagName, percentage);

        if (!success) {
            return res.status(404).json({
                error: `Feature flag '${flagName}' not found`
            });
        }

        res.json({
            flag: flagName,
            percentage,
            timestamp: new Date().toISOString(),
            message: `Rollout updated to ${percentage}%`
        });
    });

    // Enable/disable feature flag (admin only)
    app.post('/api/features/:flagName/toggle', async (req, res) => {
        // Allow without auth for testing/internal use (phase activation)
        // In production, this should require proper admin authentication
        
        const { flagName } = req.params;
        const { enabled } = req.body;

        if (enabled === undefined) {
            return res.status(400).json({
                error: 'Missing enabled parameter (true/false)'
            });
        }

        const success = featureFlags.setEnabled(flagName, enabled);

        if (!success) {
            return res.status(404).json({
                error: `Feature flag '${flagName}' not found`
            });
        }

        res.json({
            flag: flagName,
            enabled,
            timestamp: new Date().toISOString(),
            message: `Feature flag ${enabled ? 'enabled' : 'disabled'}`
        });
    });

    // Feature flag rollout history
    app.get('/api/features/history/:flagName', (req, res) => {
        const { flagName } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        const flags = featureFlags.getAllFlags();
        if (!flags[flagName]) {
            return res.status(404).json({
                error: `Feature flag '${flagName}' not found`
            });
        }

        const history = featureFlags.getHistory(limit);
        const flagHistory = history.filter(h => h.flag === flagName);

        res.json({
            flag: flagName,
            history: flagHistory,
            total: flagHistory.length
        });
    });

    // Dashboard endpoint (combines all metrics)
    app.get('/api/monitoring/dashboard', (req, res) => {
        const summary = performanceMonitor.getSummary();
        const flags = featureFlags.getAllFlags();
        const endpointMetrics = performanceMonitor.getAllEndpointMetrics();

        res.json({
            timestamp: new Date().toISOString(),
            health: summary.health,
            uptime: process.uptime(),
            requests: summary.requests,
            performance: summary.performance,
            queries: summary.queries,
            cache: summary.cache,
            errors: summary.errors,
            features: flags,
            topEndpoints: Object.values(endpointMetrics)
                .sort((a, b) => parseFloat(b.avgDuration) - parseFloat(a.avgDuration))
                .slice(0, 10),
            recentAlerts: summary.alerts.slice(-10),
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                external: Math.round(process.memoryUsage().external / 1024 / 1024)
            }
        });
    });

    console.log('[Monitoring] Γ£à Monitoring endpoints registered');
}

module.exports = registerMonitoringEndpoints;

