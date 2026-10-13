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
                    return res.status(401).json({
                        success: false,
                        error: 'Username atau password salah'
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
                .select('id, username, email, password_hash, role, zona_id')
                .eq('username', username)
                .single();

            if (fetchError || !users) {
                console.warn(`[Auth] User not found: ${username}`, fetchError?.message);
                return res.status(401).json({
                    success: false,
                    error: 'Username atau password salah'
                });
            }

            // Verify password
            const passwordValid = await bcrypt.compare(password, users.password_hash);
            if (!passwordValid) {
                console.warn(`[Auth] Invalid password for user: ${username}`);
                return res.status(401).json({
                    success: false,
                    error: 'Username atau password salah'
                });
            }

            console.log(`[Auth] ✅ Password verified for user: ${username}`);

            // Generate JWT with jti (JWT ID) for forced logout tracking
            const jti = require('crypto').randomBytes(16).toString('hex');
            
            const jwtToken = jwt.sign(
                {
                    userId: users.id,
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

            // Record active session
            try {
                const { data: existing } = await supabase
                    .from('active_sessions')
                    .select('id')
                    .eq('user_id', users.id)
                    .eq('is_valid', true);

                if (existing && existing.length > 0) {
                    // Update existing session
                    await supabase
                        .from('active_sessions')
                        .update({
                            token_jti: jti,
                            last_activity: new Date().toISOString(),
                            ip_address: clientIp,
                            user_agent: req.headers['user-agent']
                        })
                        .eq('user_id', users.id)
                        .eq('is_valid', true);
                } else {
                    // Create new session
                    await supabase
                        .from('active_sessions')
                        .insert([{
                            user_id: users.id,
                            username: users.username,
                            user_role: users.role,
                            token_jti: jti,
                            ip_address: clientIp,
                            user_agent: req.headers['user-agent'],
                            is_valid: true,
                            maintenance_forced_logout: false
                        }]);
                }
            } catch (sessionErr) {
                console.error('[Auth] Failed to record session:', sessionErr.message);
            }

            return res.json({
                success: true,
                message: 'Login berhasil',
                token: jwtToken,
                user: {
                    id: users.id,
                    username: users.username,
                    email: users.email,
                    role: users.role || 'user'
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

};


