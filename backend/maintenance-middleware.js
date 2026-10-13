/**
 * Maintenance Mode Middleware
 * Checks maintenance status and enforces role-based access
 * Handles forced logout mechanism for non-moderators
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const MAINTENANCE_FILE = path.join(__dirname, '../data/maintenance-status.json');
const FORCED_LOGOUT_FILE = path.join(__dirname, '../data/forced-logouts.json');

/**
 * Get maintenance status from file (cached)
 */
let maintenanceStatusCache = null;
let maintenanceStatusCacheTime = 0;
const CACHE_DURATION = 5000; // 5 seconds

function getMaintenanceStatus() {
    const now = Date.now();
    
    // Return cached value if still valid
    if (maintenanceStatusCache && (now - maintenanceStatusCacheTime) < CACHE_DURATION) {
        return maintenanceStatusCache;
    }

    try {
        if (fs.existsSync(MAINTENANCE_FILE)) {
            const data = JSON.parse(fs.readFileSync(MAINTENANCE_FILE, 'utf8'));
            maintenanceStatusCache = data;
            maintenanceStatusCacheTime = now;
            return data;
        }
    } catch (err) {
        console.error('[Maintenance] Error reading status file:', err.message);
    }

    return { isActive: false, allowedRole: 'moderator' };
}

/**
 * Clear maintenance status cache
 */
function clearMaintenanceCache() {
    maintenanceStatusCache = null;
    maintenanceStatusCacheTime = 0;
}

/**
 * Get forced logout list
 */
function getForcedLogoutList() {
    try {
        if (fs.existsSync(FORCED_LOGOUT_FILE)) {
            const data = JSON.parse(fs.readFileSync(FORCED_LOGOUT_FILE, 'utf8'));
            return data.tokenJtis || [];
        }
    } catch (err) {
        console.error('[Maintenance] Error reading forced logout list:', err.message);
    }
    return [];
}

/**
 * Add token to forced logout list
 */
function addToForcedLogoutList(tokenJti) {
    try {
        let data = { tokenJtis: [] };
        
        if (fs.existsSync(FORCED_LOGOUT_FILE)) {
            data = JSON.parse(fs.readFileSync(FORCED_LOGOUT_FILE, 'utf8'));
        }

        if (!data.tokenJtis.includes(tokenJti)) {
            data.tokenJtis.push(tokenJti);
            fs.writeFileSync(FORCED_LOGOUT_FILE, JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error('[Maintenance] Error updating forced logout list:', err.message);
    }
}

/**
 * Main maintenance check middleware
 * Use this on ALL protected routes
 */
function maintenanceCheckMiddleware(req, res, next) {
    try {
        const maintenance = getMaintenanceStatus();

        // Attach maintenance status to request
        req.maintenance = maintenance;

        if (!maintenance.isActive) {
            // Normal operation - continue
            return next();
        }

        // Maintenance mode is ACTIVE
        console.log(`[Maintenance] Active - User role: ${req.user?.role}, Allowed: ${maintenance.allowedRole}`);

        // Check if user's role is allowed during maintenance
        const userRole = req.user?.role;
        
        if (userRole === maintenance.allowedRole) {
            // User is moderator - allowed to continue
            console.log(`[Maintenance] Access granted for ${userRole}: ${req.user?.email}`);
            return next();
        }

        // User is NOT moderator - DENY ACCESS
        console.log(`[Maintenance] Access DENIED for ${userRole}: ${req.user?.email}`);

        res.status(503).json({
            error: 'System maintenance in progress',
            message: `Only ${maintenance.allowedRole}s can access during maintenance mode`,
            maintenance: {
                isActive: true,
                allowedRole: maintenance.allowedRole,
                reason: maintenance.reason,
                startedAt: maintenance.startedAt,
                estimatedEnd: maintenance.estimatedEnd,
                message: `This system is under maintenance. ${maintenance.description || ''}`
            },
            statusCode: 503
        });

    } catch (err) {
        console.error('[Maintenance] Middleware error:', err.message);
        // On error, allow access (fail open)
        next();
    }
}

/**
 * Forced logout check middleware
 * Use on token-dependent routes
 * Checks if token has been invalidated due to maintenance
 */
function forcedLogoutCheckMiddleware(req, res, next) {
    try {
        // Get JWT from header
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return next(); // No token, skip check
        }

        // Decode token (without verification - just to get jti)
        const decoded = jwt.decode(token);
        if (!decoded || !decoded.jti) {
            return next(); // No jti, skip check
        }

        // Check forced logout list
        const forcedLogoutList = getForcedLogoutList();
        if (forcedLogoutList.includes(decoded.jti)) {
            console.log(`[Maintenance] Token ${decoded.jti} in forced logout list`);
            
            return res.status(401).json({
                error: 'Session invalidated due to maintenance',
                message: 'Your session has been terminated due to system maintenance. Please login again when maintenance is complete.',
                maintenanceMode: true,
                forceLogout: true
            });
        }

        next();

    } catch (err) {
        console.error('[Maintenance] Forced logout check error:', err.message);
        next(); // On error, continue
    }
}

/**
 * Maintenance mode enforcement middleware
 * Stricter than maintenance check - denies ALL non-moderators
 * Use on CRITICAL routes during maintenance
 */
function enforceMaintenanceAccess(req, res, next) {
    try {
        const maintenance = getMaintenanceStatus();

        if (!maintenance.isActive) {
            return next(); // Normal operation
        }

        // Only moderators allowed
        if (req.user?.role !== 'moderator') {
            return res.status(503).json({
                error: 'Maintenance mode - access denied',
                maintenance: {
                    isActive: true,
                    allowedRole: maintenance.allowedRole,
                    reason: maintenance.reason
                }
            });
        }

        next();

    } catch (err) {
        console.error('[Maintenance] Enforcement error:', err.message);
        next();
    }
}

/**
 * WebSocket maintenance listener
 * Watches maintenance status file for changes
 */
function watchMaintenanceStatusFile(onChangeCallback) {
    try {
        const dir = path.dirname(MAINTENANCE_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Watch for file changes
        const watcher = fs.watch(MAINTENANCE_FILE, (eventType, filename) => {
            if (eventType === 'change') {
                clearMaintenanceCache();
                const newStatus = getMaintenanceStatus();
                console.log('[Maintenance] Status changed:', newStatus);
                
                if (typeof onChangeCallback === 'function') {
                    onChangeCallback(newStatus);
                }
            }
        });

        console.log('[Maintenance] File watcher started');
        return watcher;

    } catch (err) {
        console.error('[Maintenance] Watcher setup error:', err.message);
    }
}

/**
 * Batch force logout for non-moderators
 * Call this when maintenance mode starts
 */
async function forcedLogoutNonModerators(supabase, reason = 'maintenance_start') {
    try {
        // Query all active sessions that are NOT moderators
        const { data: sessions, error } = await supabase
            .from('active_sessions')
            .select('*')
            .eq('is_valid', true)
            .neq('user_role', 'moderator');

        if (error) {
            console.error('[Maintenance] Error querying active sessions:', error.message);
            return 0;
        }

        if (!sessions || sessions.length === 0) {
            console.log('[Maintenance] No non-moderator sessions to logout');
            return 0;
        }

        // Add all tokens to forced logout list
        let logoutCount = 0;
        sessions.forEach(session => {
            if (session.token_jti) {
                addToForcedLogoutList(session.token_jti);
                logoutCount++;
            }
        });

        // Update sessions in database
        const { error: updateError } = await supabase
            .from('active_sessions')
            .update({ 
                is_valid: false,
                maintenance_forced_logout: true 
            })
            .neq('user_role', 'moderator')
            .eq('is_valid', true);

        if (updateError) {
            console.error('[Maintenance] Error invalidating sessions:', updateError.message);
        }

        console.log(`[Maintenance] Forced logout completed for ${logoutCount} non-moderator sessions`);
        return logoutCount;

    } catch (err) {
        console.error('[Maintenance] Forced logout error:', err.message);
        return 0;
    }
}

/**
 * Send maintenance notification to all connected WebSocket clients
 */
function broadcastMaintenanceStatus(clients, maintenance) {
    if (!clients || clients.size === 0) {
        return;
    }

    const message = JSON.stringify({
        type: 'maintenance_status_update',
        maintenance: maintenance,
        timestamp: new Date().toISOString()
    });

    clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket OPEN
            try {
                client.send(message);
            } catch (err) {
                console.error('[Maintenance] WebSocket send error:', err.message);
            }
        }
    });
}

module.exports = {
    maintenanceCheckMiddleware,
    forcedLogoutCheckMiddleware,
    enforceMaintenanceAccess,
    getMaintenanceStatus,
    clearMaintenanceCache,
    getForcedLogoutList,
    addToForcedLogoutList,
    watchMaintenanceStatusFile,
    forcedLogoutNonModerators,
    broadcastMaintenanceStatus
};
