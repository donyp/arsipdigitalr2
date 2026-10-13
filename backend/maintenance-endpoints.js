/**
 * Maintenance Mode Endpoints
 * Handles maintenance mode management and forced logout logic
 * Only Super Admins can start/end maintenance
 * Only Moderators can access during maintenance
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  {
    realtime: { mode: 'manual' }
  }
);

const MAINTENANCE_FILE = path.join(__dirname, '../data/maintenance-status.json');
const ACTIVE_SESSIONS_FILE = path.join(__dirname, '../data/active-sessions.json');

/**
 * Helper: Read maintenance status from file
 */
function getMaintenanceStatus() {
    try {
        if (fs.existsSync(MAINTENANCE_FILE)) {
            const data = JSON.parse(fs.readFileSync(MAINTENANCE_FILE, 'utf8'));
            return data;
        }
    } catch (err) {
        console.error('[Maintenance] Error reading status file:', err.message);
    }
    return { isActive: false, allowedRole: 'moderator' };
}

/**
 * Helper: Write maintenance status to file
 */
function setMaintenanceStatus(data) {
    try {
        const dir = path.dirname(MAINTENANCE_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(MAINTENANCE_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (err) {
        console.error('[Maintenance] Error writing status file:', err.message);
        return false;
    }
}

/**
 * Helper: Get all active sessions
 */
function getActiveSessions() {
    try {
        if (fs.existsSync(ACTIVE_SESSIONS_FILE)) {
            const data = JSON.parse(fs.readFileSync(ACTIVE_SESSIONS_FILE, 'utf8'));
            return data.sessions || [];
        }
    } catch (err) {
        console.error('[Maintenance] Error reading active sessions:', err.message);
    }
    return [];
}

/**
 * Helper: Log maintenance access
 */
async function logMaintenanceAccess(req, action, details) {
    try {
        const { data, error } = await supabase
            .from('maintenance_access_logs')
            .insert([
                {
                    user_id: req.user?.id || null,
                    username: req.user?.email || null,
                    user_role: req.user?.role || null,
                    action: action,
                    ip_address: req.clientIp,
                    user_agent: req.headers['user-agent'],
                    reason: details?.reason || null,
                    details: details || {}
                }
            ]);
        
        if (error) {
            console.error('[Maintenance] Failed to log access:', error.message);
        }
    } catch (err) {
        console.error('[Maintenance] Logging error:', err.message);
    }
}

/**
 * GET /api/maintenance/status
 * Get current maintenance mode status
 * Public endpoint - anyone can check
 */
router.get('/status', (req, res) => {
    try {
        const maintenance = getMaintenanceStatus();
        
        if (maintenance.isActive) {
            const minutesRemaining = maintenance.estimatedEnd 
                ? Math.max(0, Math.floor((new Date(maintenance.estimatedEnd) - new Date()) / 1000 / 60))
                : null;
            
            return res.json({
                isActive: true,
                allowedRole: maintenance.allowedRole,
                reason: maintenance.reason,
                description: maintenance.description,
                startedAt: maintenance.startedAt,
                startedBy: maintenance.startedBy,
                estimatedEnd: maintenance.estimatedEnd,
                estimatedMinutesRemaining: minutesRemaining,
                canAccess: req.user?.role === maintenance.allowedRole
            });
        }
        
        return res.json({
            isActive: false,
            allowedRole: null,
            canAccess: true
        });
    } catch (err) {
        console.error('[Maintenance] Status error:', err.message);
        res.status(500).json({ error: 'Failed to get maintenance status' });
    }
});

/**
 * POST /api/maintenance/start
 * Start maintenance mode (Admin only)
 * Forces logout all non-moderators
 */
router.post('/start', async (req, res) => {
    try {
        // Verify admin role
        if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
            await logMaintenanceAccess(req, 'denied', {
                reason: 'Insufficient permissions to start maintenance'
            });
            return res.status(403).json({
                error: 'Only admins can start maintenance mode'
            });
        }

        const { reason, description, estimatedDurationMinutes } = req.body;

        if (!reason || !reason.trim()) {
            return res.status(400).json({ error: 'Reason is required' });
        }

        // Check if already active
        const currentStatus = getMaintenanceStatus();
        if (currentStatus.isActive) {
            return res.status(409).json({
                error: 'Maintenance mode already active',
                currentMaintenance: currentStatus
            });
        }

        // Calculate estimated end time
        const estimatedEnd = new Date(Date.now() + (estimatedDurationMinutes || 60) * 60 * 1000);

        const newStatus = {
            isActive: true,
            allowedRole: 'moderator',
            reason: reason.trim(),
            description: description?.trim() || null,
            startedAt: new Date().toISOString(),
            startedBy: req.user.email,
            estimatedDurationMinutes: estimatedDurationMinutes || 60,
            estimatedEnd: estimatedEnd.toISOString()
        };

        // Save to file
        if (!setMaintenanceStatus(newStatus)) {
            return res.status(500).json({ error: 'Failed to update maintenance status' });
        }

        // Log this action
        await logMaintenanceAccess(req, 'maintenance_started', {
            reason: reason,
            estimatedDuration: estimatedDurationMinutes
        });

        // Trigger forced logout for all non-moderators
        try {
            const { forcedLogoutNonModerators } = require('./maintenance-middleware');
            const logoutCount = await forcedLogoutNonModerators(supabase, 'maintenance_start');
            console.log(`[Maintenance] Automatically forced logout ${logoutCount} non-moderators`);
        } catch (err) {
            console.error('[Maintenance] Error forcing logout non-moderators:', err.message);
        }

        console.log(`[Maintenance] Mode started by ${req.user.email}: ${reason}`);

        // Broadcast to all connected clients via WebSocket
        if (global.maintenanceWebSocket) {
            try {
                global.maintenanceWebSocket.broadcastMaintenanceStatus();
                global.maintenanceWebSocket.broadcastNotification(
                    'Maintenance Mode Started',
                    reason,
                    'warning'
                );
            } catch (err) {
                console.error('[Maintenance] WebSocket broadcast error:', err.message);
            }
        }

        res.json({
            success: true,
            message: 'Maintenance mode started',
            maintenance: newStatus
        });

    } catch (err) {
        console.error('[Maintenance] Start error:', err.message);
        res.status(500).json({ error: 'Failed to start maintenance mode' });
    }
});

/**
 * POST /api/maintenance/end
 * End maintenance mode (Admin only)
 */
router.post('/end', async (req, res) => {
    try {
        // Verify admin role
        if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
            await logMaintenanceAccess(req, 'denied', {
                reason: 'Insufficient permissions to end maintenance'
            });
            return res.status(403).json({
                error: 'Only admins can end maintenance mode'
            });
        }

        const currentStatus = getMaintenanceStatus();
        if (!currentStatus.isActive) {
            return res.status(409).json({
                error: 'Maintenance mode not active'
            });
        }

        // End maintenance
        const endedStatus = {
            ...currentStatus,
            isActive: false,
            endedAt: new Date().toISOString(),
            endedBy: req.user.email
        };

        setMaintenanceStatus(endedStatus);

        // Log this action
        await logMaintenanceAccess(req, 'maintenance_ended', {
            duration: Math.floor((Date.now() - new Date(currentStatus.startedAt)) / 1000 / 60)
        });

        console.log(`[Maintenance] Mode ended by ${req.user.email}`);

        // Broadcast to all connected clients
        if (global.maintenanceWebSocket) {
            try {
                global.maintenanceWebSocket.broadcastMaintenanceStatus();
                global.maintenanceWebSocket.broadcastNotification(
                    'Maintenance Complete',
                    'System maintenance has been completed. You can now access the system.',
                    'success'
                );
            } catch (err) {
                console.error('[Maintenance] WebSocket broadcast error:', err.message);
            }
        }

        res.json({
            success: true,
            message: 'Maintenance mode ended',
            maintenance: endedStatus
        });

    } catch (err) {
        console.error('[Maintenance] End error:', err.message);
        res.status(500).json({ error: 'Failed to end maintenance mode' });
    }
});

/**
 * GET /api/maintenance/access-logs
 * Get maintenance access logs (Admin only)
 */
router.get('/access-logs', async (req, res) => {
    try {
        // Verify admin role
        if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin' && req.user?.role !== 'moderator') {
            return res.status(403).json({
                error: 'Only admins and moderators can view access logs'
            });
        }

        const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
        const offset = parseInt(req.query.offset) || 0;

        // Query logs from Supabase
        const { data, error, count } = await supabase
            .from('maintenance_access_logs')
            .select('*', { count: 'exact' })
            .order('timestamp', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            console.error('[Maintenance] Query error:', error.message);
            return res.status(500).json({ error: 'Failed to fetch logs' });
        }

        res.json({
            logs: data,
            total: count,
            limit: limit,
            offset: offset
        });

    } catch (err) {
        console.error('[Maintenance] Logs error:', err.message);
        res.status(500).json({ error: 'Failed to get access logs' });
    }
});

/**
 * GET /api/maintenance/forced-logouts
 * Get forced logout records (Admin only)
 */
router.get('/forced-logouts', async (req, res) => {
    try {
        if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
            return res.status(403).json({
                error: 'Only admins can view forced logout logs'
            });
        }

        const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
        const offset = parseInt(req.query.offset) || 0;

        const { data, error, count } = await supabase
            .from('forced_logout_sessions')
            .select('*', { count: 'exact' })
            .order('logged_out_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            return res.status(500).json({ error: 'Failed to fetch forced logout logs' });
        }

        res.json({
            logouts: data,
            total: count,
            limit: limit,
            offset: offset
        });

    } catch (err) {
        console.error('[Maintenance] Forced logouts error:', err.message);
        res.status(500).json({ error: 'Failed to get forced logout logs' });
    }
});

/**
 * POST /api/maintenance/logout-non-moderators
 * Force logout all non-moderators (called automatically when maintenance starts)
 */
router.post('/logout-non-moderators', async (req, res) => {
    try {
        if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
            return res.status(403).json({
                error: 'Only admins can trigger forced logouts'
            });
        }

        const maintenance = getMaintenanceStatus();
        if (!maintenance.isActive) {
            return res.status(409).json({
                error: 'Maintenance mode not active'
            });
        }

        // Get all active sessions
        const activeSessions = getActiveSessions();
        let logoutCount = 0;

        // Mark non-moderators for logout
        const logoutsToRecord = [];
        activeSessions.forEach(session => {
            if (session.userRole && session.userRole !== 'moderator') {
                logoutCount++;
                logoutsToRecord.push({
                    user_id: session.userId,
                    username: session.username,
                    user_role: session.userRole,
                    token_jti: session.tokenJti,
                    logout_reason: 'maintenance_start',
                    ip_address: session.ipAddress
                });
                session.maintenanceForcedLogout = true;
            }
        });

        // Record forced logouts in database
        if (logoutsToRecord.length > 0) {
            const { error } = await supabase
                .from('forced_logout_sessions')
                .insert(logoutsToRecord);

            if (error) {
                console.error('[Maintenance] Error recording forced logouts:', error.message);
            }
        }

        // Save updated sessions
        fs.writeFileSync(ACTIVE_SESSIONS_FILE, JSON.stringify({
            sessions: activeSessions,
            updatedAt: new Date().toISOString()
        }));

        console.log(`[Maintenance] Forced logout for ${logoutCount} non-moderators`);

        // Broadcast forced logout via WebSocket
        if (global.maintenanceWebSocket) {
            try {
                global.maintenanceWebSocket.broadcastForcedLogout('maintenance_start');
            } catch (err) {
                console.error('[Maintenance] WebSocket broadcast error:', err.message);
            }
        }

        res.json({
            success: true,
            logoutCount: logoutCount,
            message: `Forced logout completed for ${logoutCount} non-moderators`
        });

    } catch (err) {
        console.error('[Maintenance] Forced logout error:', err.message);
        res.status(500).json({ error: 'Failed to force logout users' });
    }
});

module.exports = router;
