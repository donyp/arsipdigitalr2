/**
 * Authentication Endpoints
 * Simplified login: username/password only (Daily Token system removed)
 * WITH maintenance mode check - only moderators can login during maintenance
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const MAINTENANCE_FILE = path.join(__dirname, '../data/maintenance-status.json');

// ===== Login rate limit (in-memory, single instance) =====
const LOGIN_MAX_ATTEMPTS = 3;
const LOGIN_LOCK_MINUTES = 15;
const loginAttempts = new Map();

function getLoginAttemptState(key) {
    const s = loginAttempts.get(key);
    if (!s) return { count: 0, lockedUntil: 0 };
    if (s.lockedUntil && s.lockedUntil < Date.now()) {
        loginAttempts.delete(key);
        return { count: 0, lockedUntil: 0 };
    }
    return s;
}

function recordFailedLogin(key) {
    const s = getLoginAttemptState(key);
    s.count = (s.count || 0) + 1;
    if (s.count >= LOGIN_MAX_ATTEMPTS) {
        s.lockedUntil = Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000;
    }
    loginAttempts.set(key, s);
    return s;
}

function clearLoginAttempts(key) {
    loginAttempts.delete(key);
}

/**
 * Get maintenance status
 */
function getMaintenanceStatus() {
    try {
        if (fs.existsSync(MAINTENANCE_FILE)) {
            return JSON.parse(fs.readFileSync(MAINTENANCE_FILE, 'utf8'));
        }
    } catch (err) {
        console.error('[Auth] Maintenance check error:', err.message);
    }
    return { isActive: false, allowedRole: 'moderator' };
}

module.exports = function registerAuthEndpoints(app, supabase) {

    /**
     * POST /api/auth/login
     * Simplified login: Verify username and password, return JWT token
     * WITH maintenance mode enforcement - denies non-moderators
     */
    app.post('/api/auth/login', async (req, res) => {
        try {
            console.log('[Auth] POST /api/auth/login received');
            
            const { username, password } = req.body;
            const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Username dan password harus diisi'
                });
            }

            const attemptKey = `${clientIp}::${username}`;
            const attemptState = getLoginAttemptState(attemptKey);
            if (attemptState.lockedUntil && attemptState.lockedUntil > Date.now()) {
                const retryAfter = Math.ceil((attemptState.lockedUntil - Date.now()) / 1000);
                return res.status(429).json({
                    success: false,
                    error: `Terlalu banyak percobaan login gagal. Coba lagi dalam ${Math.ceil(retryAfter / 60)} menit.`,
                    attempts: attemptState.count,
                    maxAttempts: LOGIN_MAX_ATTEMPTS,
                    lockedUntil: attemptState.lockedUntil,
                    retryAfter
                });
            }

            console.log(`[Auth] Login attempt for user: ${username}`);

            // ===== MAINTENANCE MODE CHECK =====
            const maintenance = getMaintenanceStatus();
            
            if (maintenance.isActive) {
                console.log(`[Auth] Maintenance mode ACTIVE - checking user role`);
                
                // Get user to check role (without password yet)
                const { data: users, error: fetchError } = await supabase
                    .from('users')
                    .select('id, username, email, role')
                    .eq('username', username)
                    .single();

                if (!users) {
                    console.warn(`[Auth] Maintenance: User not found: ${username}`);
                    const s = recordFailedLogin(attemptKey);
                    return res.status(401).json({
                        success: false,
                        error: 'Username atau password salah',
                        attempts: s.count,
                        maxAttempts: LOGIN_MAX_ATTEMPTS
                    });
                }

                // Check if user role matches allowed role
                if (users.role !== maintenance.allowedRole) {
                    console.warn(`[Auth] Maintenance: Access DENIED for ${users.role}: ${username}`);
                    
                    // Log denied access
                    try {
                        await supabase
                            .from('maintenance_access_logs')
                            .insert([{
                                user_id: users.id,
                                username: users.email,
                                user_role: users.role,
                                action: 'denied',
                                ip_address: clientIp,
                                user_agent: req.headers['user-agent'],
                                reason: `Maintenance mode active. Only ${maintenance.allowedRole}s allowed.`
                            }]);
                    } catch (logErr) {
                        console.error('[Auth] Failed to log denied access:', logErr.message);
                    }

                    return res.status(503).json({
                        success: false,
                        error: 'System maintenance in progress',
                        maintenance: {
                            isActive: true,
                            allowedRole: maintenance.allowedRole,
                            reason: maintenance.reason,
                            description: maintenance.description,
                            startedAt: maintenance.startedAt,
                            estimatedEnd: maintenance.estimatedEnd,
                            message: `Hanya ${maintenance.allowedRole}s yang dapat login selama pemeliharaan sistem. ${maintenance.description || ''}`
                        },
                        statusCode: 503
                    });
                }
                
                console.log(`[Auth] Maintenance: Access GRANTED for moderator: ${username}`);
            }
            // ===== END MAINTENANCE CHECK =====

            // Get user by username
            const { data: users, error: fetchError } = await supabase
                .from('users')
                .select('id, username, email, password_hash, role, zona_id, is_active')
                .eq('username', username)
                .single();

            if (fetchError || !users) {
                console.warn(`[Auth] User not found: ${username}`, fetchError?.message);
                const s = recordFailedLogin(attemptKey);
                return res.status(401).json({
                    success: false,
                    error: 'Username atau password salah',
                    attempts: s.count,
                    maxAttempts: LOGIN_MAX_ATTEMPTS
                });
            }

            // Verify password
            const passwordValid = await bcrypt.compare(password, users.password_hash);
            if (!passwordValid) {
                console.warn(`[Auth] Invalid password for user: ${username}`);
                const s = recordFailedLogin(attemptKey);
                return res.status(401).json({
                    success: false,
                    error: 'Username atau password salah',
                    attempts: s.count,
                    maxAttempts: LOGIN_MAX_ATTEMPTS
                });
            }

            console.log(`[Auth] ✅ Password verified for user: ${username}`);

            // Generate JWT with jti (JWT ID) for forced logout tracking
            const jti = require('crypto').randomBytes(16).toString('hex');
            
            const jwtToken = jwt.sign(
                {
                    sub: users.id,  // Standard JWT subject claim
                    userId: users.id,
                    id: users.id,
                    username: users.username,
                    email: users.email,
                    role: users.role || 'user',
                    zona_id: users.zona_id || null,
                    stage: 'authenticated',
                    jti: jti  // For forced logout tracking
                },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
            );

            // Log successful login
            try {
                await supabase
                    .from('maintenance_access_logs')
                    .insert([{
                        user_id: users.id,
                        username: users.email,
                        user_role: users.role,
                        action: 'granted',
                        ip_address: clientIp,
                        user_agent: req.headers['user-agent'],
                        reason: 'Successful login'
                    }]);
            } catch (logErr) {
                console.error('[Auth] Failed to log successful login:', logErr.message);
            }

            // Record active session using jti as session_id
            let sessionId = jti;
            try {
                const { data: existing } = await supabase
                    .from('active_sessions')
                    .select('session_id')
                    .eq('session_id', jti);

                if (existing && existing.length > 0) {
                    // Update existing session
                    console.log('[Auth] Updating existing session for user:', users.username);
                    const { error: updateErr } = await supabase
                        .from('active_sessions')
                        .update({
                            last_activity: new Date().toISOString()
                        })
                        .eq('session_id', jti);
                    
                    if (updateErr) {
                        console.error('[Auth] Session update error:', updateErr.message, updateErr.details);
                    }
                } else {
                    // Create new session with jti as session_id
                    console.log('[Auth] Creating new session for user:', users.username, 'with session_id:', jti, 'user_id:', users.id);
                    const { data: newSession, error: insertError } = await supabase
                        .from('active_sessions')
                        .insert([{
                            session_id: jti,
                            user_id: users.id,
                            username: users.username,
                            user_role: users.role,
                            last_activity: new Date().toISOString(),
                            is_valid: true
                        }])
                        .select('session_id');
                    
                    if (insertError) {
                        console.error('[Auth] Session insert FAILED:', {
                            message: insertError.message,
                            details: insertError.details,
                            hint: insertError.hint,
                            code: insertError.code
                        });
                    } else if (newSession && newSession.length > 0) {
                        sessionId = newSession[0].session_id;
                        console.log('[Auth] ✅ Session created successfully with ID:', sessionId);
                    } else {
                        console.warn('[Auth] Session insert returned no data');
                    }
                }
            } catch (sessionErr) {
                console.error('[Auth] Session record exception:', sessionErr.message, sessionErr.stack);
            }

            clearLoginAttempts(attemptKey);

            console.log('[Auth] 🔐 Login successful for user:', {
                id: users.id,
                username: users.username,
                email: users.email,
                role: users.role
            });

            return res.json({
                success: true,
                message: 'Login berhasil',
                token: jwtToken,
                sessionId: sessionId, // Include session ID for keep-alive
                user: {
                    id: users.id,
                    username: users.username,
                    email: users.email,
                    role: users.role || 'user',
                    is_active: users.is_active
                },
                maintenance: {
                    isActive: maintenance.isActive,
                    message: maintenance.isActive ? `Sistem dalam mode pemeliharaan. ${maintenance.description || ''}` : null
                }
            });
        } catch (error) {
            console.error('[Auth] ❌ Login error:', error.message);
            return res.status(500).json({
                success: false,
                error: 'Server error'
            });
        }
    });

    /**
     * POST /api/logout
     * Invalidate user session by marking it as invalid in active_sessions table
     */
    app.post('/api/logout', async (req, res) => {
        try {
            const { session_id } = req.body;
            const token = req.headers.authorization?.split(' ')[1];

            if (!session_id || !token) {
                return res.status(400).json({
                    error: 'Missing session_id or token'
                });
            }

            // Invalidate session in active_sessions table
            const { error: updateError } = await supabase
                .from('active_sessions')
                .update({ is_valid: false })
                .eq('session_id', session_id);

            if (updateError) {
                console.error('[Auth] Error invalidating session:', updateError.message);
                return res.status(500).json({
                    error: 'Failed to invalidate session'
                });
            }

            console.log('[Auth] Session invalidated:', session_id);

            res.json({
                success: true,
                message: 'Session invalidated'
            });
        } catch (err) {
            console.error('[Auth] Logout error:', err.message);
            res.status(500).json({
                error: 'Failed to logout'
            });
        }
    });

};


