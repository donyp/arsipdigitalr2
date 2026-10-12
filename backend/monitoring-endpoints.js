// ============================================================
// VPS System Monitoring Endpoints
// Real-time system metrics, process monitoring, and alerts
// ============================================================

const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

/**
 * Get CPU usage percentage
 */
function getCPUUsage() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
        for (type in cpu.times) {
            totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);

    return {
        usage: usage,
        cores: cpus.length,
        loadAverage: os.loadavg()
    };
}

/**
 * Get memory usage
 */
function getMemoryUsage() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;

    return {
        total: total,
        used: used,
        free: free,
        percentage: (used / total) * 100
    };
}

/**
 * Get disk usage (root partition)
 */
function getDiskUsage() {
    try {
        let output;
        if (process.platform === 'linux') {
            output = execSync('df -B1 / | tail -1').toString();
            const parts = output.trim().split(/\s+/);
            return {
                total: parseInt(parts[1]),
                used: parseInt(parts[2]),
                free: parseInt(parts[3]),
                percentage: parseInt(parts[4])
            };
        } else {
            // Fallback for non-Linux systems
            return {
                total: 1099511627776, // 1TB fallback
                used: 549755813888,   // 500GB fallback
                free: 549755813888,
                percentage: 50
            };
        }
    } catch (error) {
        console.error('Error getting disk usage:', error);
        return {
            total: 0,
            used: 0,
            free: 0,
            percentage: 0
        };
    }
}

/**
 * Get system uptime in seconds
 */
function getUptime() {
    return os.uptime();
}

/**
 * Get network statistics
 */
function getNetworkStats() {
    try {
        if (process.platform === 'linux') {
            const stats = fs.readFileSync('/proc/net/dev', 'utf8');
            const lines = stats.split('\n');
            let totalIn = 0;
            let totalOut = 0;

            lines.forEach(line => {
                if (!line.includes('face') && !line.includes('lo') && line.trim()) {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length > 9) {
                        totalIn += parseInt(parts[1]) || 0;
                        totalOut += parseInt(parts[9]) || 0;
                    }
                }
            });

            // Rough bytes per second estimation
            return {
                in: totalIn / 1000, // Convert to approximate Mbps
                out: totalOut / 1000
            };
        }
        return { in: 0, out: 0 };
    } catch (error) {
        return { in: 0, out: 0 };
    }
}

/**
 * Get top processes by CPU usage
 */
function getTopProcesses() {
    try {
        if (process.platform === 'linux') {
            const output = execSync('ps aux --sort=-%cpu | head -11').toString();
            const lines = output.split('\n').slice(1);

            return lines.map(line => {
                const parts = line.trim().split(/\s+/);
                if (parts.length > 10) {
                    return {
                        user: parts[0],
                        pid: parts[1],
                        cpu: parseFloat(parts[2]) || 0,
                        memory: parseInt(parts[5]) * 1024, // Convert KB to bytes
                        name: parts.slice(10).join(' ').substring(0, 50)
                    };
                }
            }).filter(Boolean);
        }
        return [];
    } catch (error) {
        console.error('Error getting processes:', error);
        return [];
    }
}

/**
 * Check backend service status
 */
function getBackendStatus() {
    try {
        const nodeProcs = execSync('pgrep -f "node.*server.js" || true').toString().trim();
        const running = nodeProcs.length > 0;

        return {
            running: running,
            port: 5000,
            uptime: running ? '✓ Running' : '✗ Offline'
        };
    } catch (error) {
        return {
            running: false,
            port: 5000,
            uptime: 'Error checking status'
        };
    }
}

/**
 * Register monitoring endpoints
 */
function registerMonitoringEndpoints(app, auth) {
    // Public endpoint for frontend (no auth required for now)
    app.get('/api/monitoring/stats', async (req, res) => {
        try {
            const stats = {
                cpu: getCPUUsage(),
                memory: getMemoryUsage(),
                disk: getDiskUsage(),
                uptime: getUptime(),
                network: getNetworkStats(),
                backend: getBackendStatus(),
                processes: getTopProcesses(),
                timestamp: new Date().toISOString()
            };

            res.json(stats);
        } catch (error) {
            console.error('[Monitoring] Error collecting stats:', error);
            res.status(500).json({
                error: 'Failed to collect system stats',
                details: error.message
            });
        }
    });

    // Detailed CPU info endpoint
    app.get('/api/monitoring/cpu', (req, res) => {
        const cpuInfo = {
            usage: getCPUUsage(),
            cores: os.cpus(),
            model: os.cpus()[0]?.model || 'Unknown'
        };
        res.json(cpuInfo);
    });

    // Detailed memory info endpoint
    app.get('/api/monitoring/memory', (req, res) => {
        res.json({
            ...getMemoryUsage(),
            loadAverage: os.loadavg()
        });
    });

    // Detailed disk info endpoint
    app.get('/api/monitoring/disk', (req, res) => {
        res.json(getDiskUsage());
    });

    // Top processes endpoint
    app.get('/api/monitoring/processes', (req, res) => {
        const limit = parseInt(req.query.limit) || 10;
        const processes = getTopProcesses();
        res.json(processes.slice(0, limit));
    });

    // Backend health check
    app.get('/api/monitoring/health', (req, res) => {
        res.json({
            status: 'ok',
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        });
    });

    console.log('[Monitoring] Endpoints registered successfully');
}

module.exports = {
    registerMonitoringEndpoints,
    getCPUUsage,
    getMemoryUsage,
    getDiskUsage,
    getUptime,
    getNetworkStats,
    getTopProcesses,
    getBackendStatus
};
