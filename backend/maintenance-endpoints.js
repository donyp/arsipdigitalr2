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
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

// Initialize supabase
let supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  {
    realtime: { mode: 'manual' }
  }
);

let JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Initialize function to set values from server.js
function initializeSupabase(supabaseClient, jwtSecret) {
    supabase = supabaseClient;
    JWT_SECRET = jwtSecret;
}

// ============================================================
// MIDDLEWARE
// ============================================================

/**
 * Authentication Middleware - SIMPLIFIED for debugging
 * Verifies JWT token 
 */
function authenticateToken(req, res, next) {
    console.log('[Auth] authenticateToken called for path:', req.path);
    
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]);

    if (!token) {
        console.log('[Auth] No token provided');
        return res.status(401).json({ error: 'Token tidak ditemukan. Silakan login.' });
    }

    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
        if (err) {
            console.error('[Auth] Token verification error:', err.message);
            return res.status(403).json({ error: 'Token tidak valid atau sudah expired.' });
        }
        
        try {
            console.log('[Auth] Token decoded, userId:', decoded.userId);
            
            // For now, just use the token payload directly (less risky)
            req.user = {
                id: decoded.userId || decoded.sub,
                email: decoded.email,
                username: decoded.username,
                role: decoded.role || 'user',
                zona_id: decoded.zona_id,
                permissions: decoded.permissions || []
            };
            
            console.log('[Auth] User set:', req.user.email, 'role:', req.user.role);
            next();
        } catch (err) {
            console.error('[Auth] Error:', err.message, err.stack);
            return res.status(500).json({ error: 'Authentication error', details: err.message });
        }
    });
}

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
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
        
        const { data, error } = await supabase
            .from('maintenance_access_logs')
            .insert([
                {
                    user_id: req.user?.id || null,
                    username: req.user?.email || null,
                    user_role: req.user?.role || null,
                    action: action,
                    ip_address: clientIp,
                    user_agent: req.headers['user-agent'],
                    reason: details?.reason || null
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
 * GET /api/maintenance/ping
 * Simple ping test endpoint
 */
router.get('/ping', (req, res) => {
    console.log('[Maintenance] GET /ping called');
    res.json({ pong: true, timestamp: new Date().toISOString() });
});

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
router.post('/start', authenticateToken, async (req, res) => {
    try {
        // Verify admin or moderator role
        if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin' && req.user?.role !== 'moderator') {
            await logMaintenanceAccess(req, 'denied', {
                reason: 'Insufficient permissions to start maintenance'
            });
            return res.status(403).json({
                error: 'Only admins and moderators can start maintenance mode'
            });
        }

        const { reason, description, estimatedDuration } = req.body;

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

        // Calculate estimated end time (use provided duration or default to 60 minutes)
        const durationMinutes = estimatedDuration ? parseInt(estimatedDuration) : 60;
        const estimatedEnd = new Date(Date.now() + durationMinutes * 60 * 1000);

        const newStatus = {
            isActive: true,
            allowedRole: 'moderator',
            reason: reason.trim(),
            description: description?.trim() || null,
            startedAt: new Date().toISOString(),
            startedBy: req.user.email,
            estimatedDurationMinutes: durationMinutes,
            estimatedEnd: estimatedEnd.toISOString()
        };

        // Save to file
        if (!setMaintenanceStatus(newStatus)) {
            return res.status(500).json({ error: 'Failed to update maintenance status' });
        }

        // Log this action
        await logMaintenanceAccess(req, 'maintenance_started', {
            reason: reason,
            estimatedDuration: durationMinutes
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
router.post('/end', authenticateToken, async (req, res) => {
    try {
        // Verify admin or moderator role
        if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin' && req.user?.role !== 'moderator') {
            await logMaintenanceAccess(req, 'denied', {
                reason: 'Insufficient permissions to end maintenance'
            });
            return res.status(403).json({
                error: 'Only admins and moderators can end maintenance mode'
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
 * GET /api/maintenance/active-sessions
 * Get all active sessions (Admin only)
 * Shows real-time session data with user info
 */
router.get('/active-sessions', authenticateToken, async (req, res) => {
    try {
        if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin' && req.user?.role !== 'moderator') {
            return res.status(403).json({
                error: 'Only admins and moderators can view active sessions'
            });
        }

        // Query active sessions directly from database (authoritative source)
        console.log('[Maintenance] Querying active_sessions with is_valid=true filter');
        
        // Try without filter first to see if table is accessible
        const { data: allSessions, error: allError, count: allCount } = await supabase
            .from('active_sessions')
            .select('*', { count: 'exact' });
        
        console.log('[Maintenance] All sessions (no filter):', { allCount, allError: allError?.message });
        
        // Now try with filter
        const { data: sessions, error, count } = await supabase
            .from('active_sessions')
            .select('*', { count: 'exact' })
            .eq('is_valid', true)
            .order('last_activity', { ascending: false })
            .limit(100);

        if (error) {
            console.error('[Maintenance] Query error:', error.message);
            return res.status(500).json({ error: 'Failed to fetch active sessions' });
        }

        console.log('[Maintenance] Active sessions (is_valid=true):', { count, sessionsCount: sessions?.length, firstSession: sessions?.[0] });

        // Transform session data for display
        const transformedSessions = (sessions || []).map(session => ({
            id: session.id,
            user_id: session.user_id,
            username: session.username,
            user_email: session.username, // email might be stored in username field
            user_role: session.user_role,
            ip_address: session.ip_address,
            user_agent: session.user_agent,
            token_jti: session.token_jti,
            is_valid: session.is_valid,
            maintenance_forced_logout: session.maintenance_forced_logout,
            created_at: session.created_at,
            last_activity: session.last_activity,
            // Calculate time since last activity
            inactiveDurationSeconds: session.last_activity 
                ? Math.floor((Date.now() - new Date(session.last_activity)) / 1000)
                : null
        }));

        res.json({
            total: count,
            sessions: transformedSessions,
            timestamp: new Date().toISOString(),
            notes: {
                is_valid: 'Whether session token is still active',
                maintenance_forced_logout: 'Whether session was forcibly ended due to maintenance',
                inactiveDurationSeconds: 'Seconds since last activity - WARNING if > 3600 (1 hour)'
            }
        });

    } catch (err) {
        console.error('[Maintenance] Active sessions error:', err.message);
        res.status(500).json({ error: 'Failed to get active sessions' });
    }
});

router.put('/active-sessions/:sessionId/update-activity', async (req, res) => {
    try {
        console.log('[MAINTENANCE-ENDPOINT] PUT /active-sessions/:sessionId/update-activity reached');
        const { sessionId } = req.params;
        console.log('[MAINTENANCE-ENDPOINT] sessionId:', sessionId);
        
        // Simple approach: just try to update. If session doesn't exist, that's okay.
        // This endpoint is called from client-side keep-alive - we don't need to track
        // every ping in the database. The session tracking happens on login/logout.
        
        const { error: updateError } = await supabase
            .from('active_sessions')
            .update({ last_activity: new Date().toISOString() })
            .eq('session_id', sessionId);

        if (updateError) {
            // If session doesn't exist, don't fail - just log it
            console.log('[MAINTENANCE-ENDPOINT] Update note:', updateError.message);
            // Continue anyway - client just needs a 200 response to know keep-alive worked
        }

        console.log('[MAINTENANCE-ENDPOINT] Session keep-alive processed successfully');
        res.json({ success: true, timestamp: new Date().toISOString() });

    } catch (err) {
        console.error('[MAINTENANCE-ENDPOINT] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/maintenance/active-sessions/:sessionId
 * Manually invalidate a specific session (Admin only)
 * Used to force logout a specific user
 */
router.delete('/active-sessions/:sessionId', authenticateToken, async (req, res) => {
    try {
        if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
            return res.status(403).json({
                error: 'Only admins can invalidate sessions'
            });
        }

        const { sessionId } = req.params;

        // Get session info before deletion
        const { data: session, error: queryError } = await supabase
            .from('active_sessions')
            .select('*')
            .eq('id', sessionId)
            .single();

        if (queryError || !session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Invalidate the session
        const { error: updateError } = await supabase
            .from('active_sessions')
            .update({ 
                is_valid: false,
                maintenance_forced_logout: true
            })
            .eq('id', sessionId);

        if (updateError) {
            return res.status(500).json({ error: 'Failed to invalidate session' });
        }

        // Add token to forced logout list if available
        if (session.token_jti) {
            try {
                const { addToForcedLogoutList } = require('./maintenance-middleware');
                addToForcedLogoutList(session.token_jti);
            } catch (err) {
                console.error('[Maintenance] Could not add to forced logout list:', err.message);
            }
        }

        // Log this admin action
        await logMaintenanceAccess(req, 'session_invalidated', {
            session_id: sessionId,
            target_user: session.username,
            target_role: session.user_role
        });

        res.json({
            success: true,
            message: 'Session invalidated',
            invalidated_session: {
                id: sessionId,
                username: session.username,
                user_role: session.user_role,
                ip_address: session.ip_address
            }
        });

    } catch (err) {
        console.error('[Maintenance] Invalidate session error:', err.message);
        res.status(500).json({ error: 'Failed to invalidate session' });
    }
});

/**
 * POST /api/maintenance/verify-sessions
 * Verify and clean up stale sessions (Admin only)
 * Checks session validity and removes expired/stale entries
 */
router.post('/verify-sessions', authenticateToken, async (req, res) => {
    try {
        if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
            return res.status(403).json({
                error: 'Only admins can verify sessions'
            });
        }

        const { inactiveThresholdMinutes = 60 } = req.body;
        const inactiveThresholdMs = inactiveThresholdMinutes * 60 * 1000;
        const now = Date.now();

        // Query all active sessions
        const { data: allSessions, error } = await supabase
            .from('active_sessions')
            .select('*')
            .eq('is_valid', true);

        if (error) {
            return res.status(500).json({ error: 'Failed to query sessions' });
        }

        // Identify stale sessions
        const staleSessions = (allSessions || []).filter(session => {
            if (!session.last_activity) return true;
            const inactiveDuration = now - new Date(session.last_activity).getTime();
            return inactiveDuration > inactiveThresholdMs;
        });

        // Invalidate stale sessions
        if (staleSessions.length > 0) {
            const staleIds = staleSessions.map(s => s.id);
            
            const { error: updateError } = await supabase
                .from('active_sessions')
                .update({ 
                    is_valid: false,
                    maintenance_forced_logout: false,
                    // Comment: 'auto-invalidated due to inactivity'
                })
                .in('id', staleIds);

            if (updateError) {
                console.error('[Maintenance] Error invalidating stale sessions:', updateError.message);
            }
        }

        res.json({
            success: true,
            message: 'Session verification completed',
            stats: {
                total_active_sessions: (allSessions || []).length,
                stale_sessions_found: staleSessions.length,
                stale_sessions_invalidated: staleSessions.length,
                inactiveThresholdMinutes: inactiveThresholdMinutes,
                timestamp: new Date().toISOString()
            },
            stale_sessions: staleSessions.map(s => ({
                id: s.id,
                username: s.username,
                user_role: s.user_role,
                last_activity: s.last_activity,
                inactiveDurationMinutes: Math.floor((now - new Date(s.last_activity).getTime()) / 1000 / 60)
            }))
        });

    } catch (err) {
        console.error('[Maintenance] Verify sessions error:', err.message);
        res.status(500).json({ error: 'Failed to verify sessions' });
    }
});

/**
 * GET /api/maintenance/access-logs
 * Get maintenance access logs (Admin + Moderator)
 */
router.get('/access-logs', authenticateToken, async (req, res) => {
    try {
        console.log('[AccessLogs] GET /access-logs called');
        
        // Debug: Log user info
        console.log('[AccessLogs] User info:', {
            user_id: req.user?.id,
            email: req.user?.email,
            role: req.user?.role
        });

        // Verify admin or moderator role (case-insensitive)
        const userRole = req.user?.role?.toLowerCase();
        if (userRole !== 'admin' && userRole !== 'super_admin' && userRole !== 'moderator') {
            console.log('[AccessLogs] Access denied for role:', req.user?.role);
            return res.status(403).json({
                error: 'Only admins and moderators can view access logs'
            });
        }

        console.log('[AccessLogs] Access granted for role:', userRole);

        const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
        const offset = parseInt(req.query.offset) || 0;

        console.log('[AccessLogs] Query params - limit:', limit, 'offset:', offset);

        try {
            // Query logs from Supabase
            console.log('[AccessLogs] Querying maintenance_access_logs table...');
            const { data, error, count } = await supabase
                .from('maintenance_access_logs')
                .select('*', { count: 'exact' })
                .order('timestamp', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) {
                console.error('[AccessLogs] Query error:', error.message);
                // Return empty array if table doesn't exist
                console.log('[AccessLogs] Returning empty result due to error');
                return res.json({
                    logs: [],
                    total: 0,
                    limit: limit,
                    offset: offset,
                    message: 'Access logs table not yet initialized',
                    error: error.message
                });
            }

            console.log('[AccessLogs] Query successful - found', data?.length || 0, 'logs, total:', count);
            res.json({
                logs: data || [],
                total: count || 0,
                limit: limit,
                offset: offset
            });
        } catch (queryErr) {
            console.error('[AccessLogs] Database query exception:', queryErr.message);
            return res.json({
                logs: [],
                total: 0,
                limit: limit,
                offset: offset,
                message: 'Unable to load logs',
                error: queryErr.message
            });
        }

    } catch (err) {
        console.error('[AccessLogs] General error:', err.message);
        res.status(500).json({ error: 'Failed to get access logs', details: err.message });
    }
});

/**
 * GET /api/maintenance/forced-logouts
 * Get forced logout records (Admin only)
 */
router.get('/forced-logouts', authenticateToken, async (req, res) => {
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
 * Force logout ALL users (including moderators) to disconnect everyone
 * This is used before starting maintenance mode
 * Allows: admin, super_admin, moderator
 */
router.post('/logout-non-moderators', authenticateToken, async (req, res) => {
    try {
        if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin' && req.user?.role !== 'moderator') {
            return res.status(403).json({
                error: 'Only admins and moderators can trigger forced logouts'
            });
        }

        console.log('[Maintenance] Force logout requested by:', req.user.email, 'role:', req.user.role);

        // Query ALL active sessions from database (not filtering by role - logout everyone)
        const { data: allSessions, error: queryError } = await supabase
            .from('active_sessions')
            .select('*')
            .eq('is_valid', true);

        if (queryError) {
            console.error('[Maintenance] Error querying sessions:', queryError.message);
            return res.status(500).json({ error: 'Failed to query sessions' });
        }

        console.log('[Maintenance] Found active sessions to logout:', allSessions?.length || 0);

        // Invalidate ALL sessions (except the current user's session if admin wants to continue)
        let logoutCount = 0;
        if (allSessions && allSessions.length > 0) {
            // Get current user's session ID to potentially exclude it
            const currentSessionId = req.user.jti; // JTI from current token
            
            // Filter sessions to logout (all except current user's own session)
            const sessionsToLogout = allSessions.filter(session => {
                return session.session_id !== currentSessionId;
            });

            console.log('[Maintenance] Sessions to logout (excluding current):', sessionsToLogout.length);

            if (sessionsToLogout.length > 0) {
                const sessionIds = sessionsToLogout.map(s => s.id);
                
                const { error: updateError } = await supabase
                    .from('active_sessions')
                    .update({ 
                        is_valid: false,
                        maintenance_forced_logout: true
                    })
                    .in('id', sessionIds);

                if (updateError) {
                    console.error('[Maintenance] Error invalidating sessions:', updateError.message);
                    return res.status(500).json({ error: 'Failed to invalidate sessions' });
                }

                logoutCount = sessionsToLogout.length;
                console.log('[Maintenance] Invalidated sessions:', logoutCount);
            }

            // Record forced logouts
            if (sessionsToLogout.length > 0) {
                const logoutsToRecord = sessionsToLogout.map(session => ({
                    user_id: session.user_id,
                    username: session.username,
                    user_role: session.user_role,
                    token_jti: session.session_id,
                    logout_reason: 'admin_forced_all',
                    ip_address: session.ip_address
                }));

                const { error: insertError } = await supabase
                    .from('forced_logout_sessions')
                    .insert(logoutsToRecord);

                if (insertError) {
                    console.error('[Maintenance] Error recording forced logouts:', insertError.message);
                    // Don't return error - we already invalidated sessions
                }
            }
        }

        res.json({
            success: true,
            logoutCount: logoutCount,
            message: `Force logout completed - ${logoutCount} users disconnected. You may continue using this session.`
        });

    } catch (err) {
        console.error('[Maintenance] Forced logout error:', err.message);
        res.status(500).json({ error: 'Failed to force logout users' });
    }
});

/**
 * POST /api/maintenance/check-session
 * Check if current session is still valid
 * Returns { isValid: true/false }
 */
router.post('/check-session', authenticateToken, async (req, res) => {
    try {
        const { sessionId } = req.body;
        const userToken = req.headers.authorization?.split(' ')[1];

        if (!sessionId || !userToken) {
            return res.status(400).json({ 
                isValid: false,
                error: 'Missing sessionId or token'
            });
        }

        // Decode token to get JTI
        let jti;
        try {
            const decoded = jwt.verify(userToken, JWT_SECRET);
            jti = decoded.jti;
        } catch (err) {
            console.log('[Maintenance] Token verification failed:', err.message);
            return res.status(401).json({ 
                isValid: false,
                error: 'Invalid token'
            });
        }

        // Query database to check if session is still valid
        const { data: sessions, error } = await supabase
            .from('active_sessions')
            .select('*')
            .eq('session_id', jti)
            .eq('is_valid', true);

        if (error) {
            console.error('[Maintenance] Error checking session:', error.message);
            return res.status(500).json({ 
                isValid: false,
                error: 'Failed to check session'
            });
        }

        const isValid = sessions && sessions.length > 0;
        
        console.log('[Maintenance] Session validity check for', jti, ':', isValid);

        res.json({
            isValid: isValid,
            message: isValid ? 'Session is valid' : 'Session has been invalidated'
        });

    } catch (err) {
        console.error('[Maintenance] Check session error:', err.message);
        res.status(500).json({ 
            isValid: false,
            error: 'Failed to check session'
        });
    }
});

module.exports = router;
module.exports.initializeSupabase = initializeSupabase;
