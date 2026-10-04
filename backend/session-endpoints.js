/**
 * Session Management Endpoints
 * View active sessions, manage concurrent sessions
 */

const SessionManager = require('./session-manager');
const { AuditLogger } = require('./audit-logger');

function registerSessionEndpoints(app, supabase, createAuth, auditLogger) {
    
    // ============================================
    // GET /api/auth/sessions
    // Get user's active sessions
    // ============================================
    app.get('/api/auth/sessions',
        ...createAuth(['super_admin', 'admin', 'moderator', 'operator']),
        async (req, res) => {
            try {
                const userId = req.user.userId;
                const sessionManager = new SessionManager(supabase);

                const result = await sessionManager.getUserActiveSessions(userId);

                if (!result.success) {
                    return res.status(500).json({ error: 'Gagal mengambil session data' });
                }

                res.json({
                    success: true,
                    sessions: result.sessions,
                    maxAllowed: 2,
                    activeCount: result.sessions.length
                });
            } catch (err) {
                console.error('[Session] Error getting sessions:', err);
                res.status(500).json({ error: 'Server error' });
            }
        }
    );

    // ============================================
    // POST /api/auth/sessions/terminate
    // Terminate specific session
    // ============================================
    app.post('/api/auth/sessions/terminate',
        ...createAuth(['super_admin', 'admin', 'moderator', 'operator']),
        async (req, res) => {
            try {
                const { sessionId } = req.body;
                
                if (!sessionId) {
                    return res.status(400).json({ error: 'Session ID wajib diisi' });
                }

                // Get session first to check ownership
                const { data: session, error: sessionError } = await supabase
                    .from('user_sessions')
                    .select('user_id, id')
                    .eq('id', sessionId)
                    .single();

                if (sessionError || !session) {
                    return res.status(404).json({ error: 'Session tidak ditemukan' });
                }

                // Only allow user to terminate their own sessions or admin
                if (session.user_id !== req.user.userId && req.user.role !== 'super_admin') {
                    return res.status(403).json({ error: 'Tidak diizinkan terminate session orang lain' });
                }

                // Terminate session
                const sessionManager = new SessionManager(supabase);
                const { data: sessionToken } = await supabase
                    .from('user_sessions')
                    .select('session_token')
                    .eq('id', sessionId)
                    .single();

                if (sessionToken) {
                    await sessionManager.terminateSession(sessionToken.session_token);
                }

                // Log audit
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: req.user.userId,
                    userEmail: req.user.email,
                    userRole: req.user.role,
                    zonaId: req.user.zona_id,
                    action: 'Terminate user session',
                    resourceType: 'user_session',
                    resourceId: sessionId,
                    resourceName: `Session ${sessionId.substring(0, 8)}...`,
                    operation: 'DELETE',
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: '/api/auth/sessions/terminate',
                    requestMethod: 'POST',
                    statusCode: 200,
                    responseMessage: 'Session terminated',
                    errorMessage: null,
                    isSuspicious: false,
                    severity: 'info'
                });

                res.json({ success: true, message: 'Session terminated' });
            } catch (err) {
                console.error('[Session] Error terminating session:', err);
                res.status(500).json({ error: 'Server error' });
            }
        }
    );

    // ============================================
    // POST /api/auth/sessions/terminate-all
    // Terminate all other sessions (keep current)
    // ============================================
    app.post('/api/auth/sessions/terminate-all',
        ...createAuth(['super_admin', 'admin', 'moderator', 'operator']),
        async (req, res) => {
            try {
                const userId = req.user.userId;
                const { currentSessionToken } = req.body;

                // Get all active sessions except current
                const { data: sessions, error: sessionsError } = await supabase
                    .from('user_sessions')
                    .select('session_token')
                    .eq('user_id', userId)
                    .eq('is_active', true)
                    .gt('expires_at', new Date().toISOString());

                if (sessionsError) {
                    return res.status(500).json({ error: 'Gagal mengambil session data' });
                }

                const sessionManager = new SessionManager(supabase);
                let terminatedCount = 0;

                // Terminate all except current
                for (const session of sessions || []) {
                    if (session.session_token !== currentSessionToken) {
                        await sessionManager.terminateSession(session.session_token);
                        terminatedCount++;
                    }
                }

                // Log audit
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: req.user.userId,
                    userEmail: req.user.email,
                    userRole: req.user.role,
                    zonaId: req.user.zona_id,
                    action: `Terminate all other sessions (${terminatedCount} terminated)`,
                    resourceType: 'user_session',
                    resourceId: userId,
                    resourceName: req.user.email,
                    operation: 'DELETE',
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: '/api/auth/sessions/terminate-all',
                    requestMethod: 'POST',
                    statusCode: 200,
                    responseMessage: `${terminatedCount} sessions terminated`,
                    errorMessage: null,
                    isSuspicious: false,
                    severity: 'info'
                });

                res.json({ 
                    success: true, 
                    message: `${terminatedCount} sesi lain berhasil ditutup`,
                    terminatedCount 
                });
            } catch (err) {
                console.error('[Session] Error terminating all sessions:', err);
                res.status(500).json({ error: 'Server error' });
            }
        }
    );

    // ============================================
    // Admin: GET /api/admin/user/:userId/sessions
    // View user's active sessions (admin only)
    // ============================================
    app.get('/api/admin/user/:userId/sessions',
        ...createAuth(['super_admin']),
        async (req, res) => {
            try {
                const { userId } = req.params;
                const sessionManager = new SessionManager(supabase);

                const result = await sessionManager.getUserActiveSessions(userId);

                if (!result.success) {
                    return res.status(500).json({ error: 'Gagal mengambil session data' });
                }

                res.json({
                    success: true,
                    userId,
                    sessions: result.sessions,
                    maxAllowed: 2,
                    activeCount: result.sessions.length
                });
            } catch (err) {
                console.error('[Session] Admin error getting sessions:', err);
                res.status(500).json({ error: 'Server error' });
            }
        }
    );

    // ============================================
    // Admin: POST /api/admin/user/:userId/force-logout
    // Force logout user (admin only)
    // ============================================
    app.post('/api/admin/user/:userId/force-logout',
        ...createAuth(['super_admin']),
        async (req, res) => {
            try {
                const { userId } = req.params;
                const sessionManager = new SessionManager(supabase);

                const result = await sessionManager.forceLogoutUser(userId);

                if (!result.success) {
                    return res.status(500).json({ error: 'Gagal force logout user' });
                }

                // Log audit
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: req.user.userId,
                    userEmail: req.user.email,
                    userRole: req.user.role,
                    zonaId: req.user.zona_id,
                    action: `Force logout user ${userId}`,
                    resourceType: 'user_session',
                    resourceId: userId,
                    resourceName: `User ${userId}`,
                    operation: 'DELETE',
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: `/api/admin/user/${userId}/force-logout`,
                    requestMethod: 'POST',
                    statusCode: 200,
                    responseMessage: 'User force logged out',
                    errorMessage: null,
                    isSuspicious: false,
                    severity: 'info'
                });

                res.json({ 
                    success: true, 
                    message: 'User berhasil dilogout dari semua perangat'
                });
            } catch (err) {
                console.error('[Session] Admin error forcing logout:', err);
                res.status(500).json({ error: 'Server error' });
            }
        }
    );
}

module.exports = registerSessionEndpoints;
