/**
 * Daily Token Authentication Endpoints
 * 2-Factor login flow: username/password -> token verification
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const DailyTokenService = require('./daily-token-service');

module.exports = function registerDailyTokenEndpoints(app, supabase, dailyTokenService) {

    /**
     * POST /api/auth/login
     * Step 1: Verify username and password
     * If ENABLE_DAILY_TOKEN_AUTH: Returns temporary token for token verification
     * If disabled: Returns full JWT token immediately
     */
    app.post('/api/auth/login', async (req, res) => {
        try {
            console.log('[DailyTokenEndpoints] POST /api/auth/login received');
            console.log('[DailyTokenEndpoints] Request body keys:', Object.keys(req.body || {}));
            
            const { username, password } = req.body;
            const tokenAuthEnabled = process.env.ENABLE_DAILY_TOKEN_AUTH === 'true';
            
            console.log('[DailyTokenEndpoints] Token auth enabled:', tokenAuthEnabled);

            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Username dan password harus diisi'
                });
            }

            console.log(`[Auth] Login attempt for user: ${username}`);
            console.log(`[Auth] ENABLE_DAILY_TOKEN_AUTH env var: ${process.env.ENABLE_DAILY_TOKEN_AUTH}`);
            console.log(`[Auth] tokenAuthEnabled boolean: ${tokenAuthEnabled}`);

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

            // If token auth is DISABLED - direct login
            if (!tokenAuthEnabled) {
                console.log(`[Auth] Token auth disabled - issuing full JWT token`);
                
                const jwtToken = jwt.sign(
                    {
                        userId: users.id,
                        username: users.username,
                        email: users.email,
                        role: users.role || 'user',
                        zona_id: users.zona_id || null,
                        stage: 'authenticated'
                    },
                    process.env.JWT_SECRET,
                    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
                );

                return res.json({
                    success: true,
                    message: 'Login berhasil',
                    token: jwtToken,
                    user: {
                        id: users.id,
                        username: users.username,
                        email: users.email,
                        role: users.role || 'user'
                    }
                });
            }

            // Token auth is ENABLED - proceed with 2FA flow
            // Check if user has valid email
            if (!users.email || !users.email.includes('@')) {
                console.warn(`[Auth] User has no valid email: ${username}`);
                return res.status(403).json({
                    success: false,
                    error: 'Email tidak valid. Hubungi administrator'
                });
            }

            // Check if user is admin (super_admin or moderator) - for single token verification per day
            const userRole = users.role || 'user';
            const isAdmin = ['super_admin', 'moderator'].includes(userRole);

            // Check if user has a valid token for today (generated at 04:00)
            const now = new Date();
            const { data: tokenRecord, error: tokenError } = await supabase
                .from('daily_login_tokens')
                .select('token, expires_at, email_sent, token_verified_at, id')
                .eq('user_id', users.id)
                .gt('expires_at', now.toISOString())
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (tokenError || !tokenRecord) {
                console.warn(`[Auth] No valid token found for user: ${username}`);
                return res.status(403).json({
                    success: false,
                    error: 'Kode akses belum dikirim. Coba login lagi nanti atau hubungi admin'
                });
            }

            // 🔑 NEW FEATURE: For admins, check if token was already verified today
            // If yes → skip token verification and issue JWT directly
            if (isAdmin && tokenRecord.token_verified_at) {
                const verifiedDate = new Date(tokenRecord.token_verified_at);
                const today = new Date();
                
                // Check if verified today (same calendar day)
                if (verifiedDate.toDateString() === today.toDateString()) {
                    console.log(`[Auth] ✅ Admin user ${username} already verified token today. Issuing JWT directly.`);
                    
                    // Get full user data
                    const { data: fullUser } = await supabase
                        .from('users')
                        .select('id, username, email, role, zona_id')
                        .eq('id', users.id)
                        .single();

                    const jwtToken = jwt.sign(
                        {
                            userId: users.id,
                            username: users.username,
                            email: users.email,
                            role: fullUser?.role || 'user',
                            zona_id: fullUser?.zona_id || null,
                            stage: 'authenticated'
                        },
                        process.env.JWT_SECRET,
                        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
                    );

                    return res.json({
                        success: true,
                        message: 'Login berhasil (token sudah diverifikasi hari ini)',
                        token: jwtToken,
                        user: {
                            id: users.id,
                            username: users.username,
                            email: users.email,
                            role: fullUser?.role || 'user'
                        },
                        skipTokenVerification: true
                    });
                }
            }

            // Generate temporary JWT for token form (valid 24 hours, same as daily token)
            const tempToken = jwt.sign(
                {
                    userId: users.id,
                    username: users.username,
                    email: users.email,
                    role: users.role || 'user',  // 🔑 ADD ROLE so frontend can decide UI elements
                    stage: 'token_verification'
                },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({
                success: true,
                message: 'Password benar. Kode sudah dikirim ke email Anda pukul 04:00',
                tempToken,
                email: users.email,
                expiresIn: 86400 // 24 hours in seconds
            });

        } catch (error) {
            console.error('[Auth] Login error:', error);
            console.error('[Auth] Error stack:', error.stack);
            res.status(500).json({
                success: false,
                error: 'Terjadi kesalahan saat login',
                debug: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    });

    /**
     * POST /api/auth/verify-token
     * Step 2: Verify 5-digit token with attempt tracking
     * Only active if ENABLE_DAILY_TOKEN_AUTH=true
     * Input: tempToken (from step 1), token (5 digits)
     * Returns: valid JWT if token matches
     */
    app.post('/api/auth/verify-token', async (req, res) => {
        try {
            const tokenAuthEnabled = process.env.ENABLE_DAILY_TOKEN_AUTH === 'true';

            if (!tokenAuthEnabled) {
                return res.status(403).json({
                    success: false,
                    error: 'Token authentication is disabled'
                });
            }

            const { tempToken, token } = req.body;

            if (!tempToken || !token) {
                return res.status(400).json({
                    success: false,
                    error: 'Token dan kode harus diisi'
                });
            }

            // Verify temp token
            let decoded;
            try {
                decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
            } catch (error) {
                return res.status(401).json({
                    success: false,
                    error: 'Sesi berakhir. Silakan login kembali'
                });
            }

            if (decoded.stage !== 'token_verification') {
                return res.status(401).json({
                    success: false,
                    error: 'Token tidak valid'
                });
            }

            const userId = decoded.userId;
            console.log(`[Auth] Token verification attempt for user ${userId}, token: ${token}`);

            // Verify the 5-digit token
            const verifyResult = await dailyTokenService.verifyToken(userId, token);

            if (!verifyResult.success) {
                // Record failed attempt
                const attemptResult = await dailyTokenService.recordFailedAttempt(userId, token);

                if (attemptResult) {
                    const remaining = attemptResult.remainingAttempts;
                    const message = remaining > 0
                        ? `Kode salah. Sisa ${remaining}/${dailyTokenService.MAX_ATTEMPTS} percobaan`
                        : 'Terlalu banyak percobaan. Coba lagi nanti';

                    console.warn(`[Auth] Failed token attempt for user ${userId}: ${remaining}/${dailyTokenService.MAX_ATTEMPTS}`);

                    return res.status(401).json({
                        success: false,
                        error: verifyResult.error,
                        message,
                        attempts: attemptResult.attempts,
                        remainingAttempts: attemptResult.remainingAttempts,
                        isLocked: attemptResult.isLocked
                    });
                }

                return res.status(401).json({
                    success: false,
                    error: verifyResult.error
                });
            }

            // Token is valid - create full JWT session
            // Get full user data including role
            const { data: fullUser } = await supabase
                .from('users')
                .select('id, username, email, role, zona_id')
                .eq('id', userId)
                .single();

            const jwtToken = jwt.sign(
                {
                    userId: userId,
                    username: decoded.username,
                    email: decoded.email,
                    role: fullUser?.role || 'user',
                    zona_id: fullUser?.zona_id || null,
                    stage: 'authenticated'
                },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
            );

            console.log(`[Auth] ✅ User authenticated: ${decoded.username} (ID: ${userId})`);

            res.json({
                success: true,
                message: 'Login berhasil',
                token: jwtToken,
                user: {
                    id: userId,
                    username: decoded.username,
                    email: decoded.email,
                    role: fullUser?.role || 'user'
                }
            });

        } catch (error) {
            console.error('[Auth] Token verification error:', error);
            res.status(500).json({
                success: false,
                error: 'Terjadi kesalahan saat verifikasi kode'
            });
        }
    });

    /**
     * POST /api/auth/resend-token
     * Admin/User request to resend token
     * Note: Tokens are generated daily at 04:00 via scheduler
     * This endpoint can resend the most recent token if email didn't arrive
     */
    app.post('/api/auth/resend-token', async (req, res) => {
        try {
            const { tempToken } = req.body;

            if (!tempToken) {
                return res.status(400).json({
                    success: false,
                    error: 'Session tidak valid'
                });
            }

            // Verify temp token
            let decoded;
            try {
                decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
            } catch (error) {
                return res.status(401).json({
                    success: false,
                    error: 'Sesi berakhir'
                });
            }

            const userId = decoded.userId;
            console.log(`[Auth] Resend token requested for user ${userId}`);

            // Get user's current token (generated at 04:00 today)
            const now = new Date();
            const { data: tokenRecord } = await supabase
                .from('daily_login_tokens')
                .select('*')
                .eq('user_id', userId)
                .gt('expires_at', now.toISOString())
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (!tokenRecord) {
                return res.status(404).json({
                    success: false,
                    error: 'Token untuk hari ini belum tersedia. Coba lagi setelah jam 04:00'
                });
            }

            // Check if already sent today (to prevent spam)
            const lastSentAt = tokenRecord.email_sent_at ? new Date(tokenRecord.email_sent_at) : null;
            const now_time = new Date();
            
            if (lastSentAt) {
                const minutesSinceSent = (now_time - lastSentAt) / (1000 * 60);
                if (minutesSinceSent < 5) {
                    return res.status(429).json({
                        success: false,
                        error: 'Tunggu beberapa menit sebelum meminta ulang kode'
                    });
                }
            }

            // Resend email
            const emailResult = await dailyTokenService.sendTokenEmail(
                userId,
                decoded.email,
                tokenRecord.token,
                decoded.username
            );

            if (emailResult.success) {
                console.log(`[Auth] ✅ Token resent to ${decoded.email}`);
                return res.json({
                    success: true,
                    message: 'Kode sudah dikirim ulang ke email Anda'
                });
            } else {
                console.error(`[Auth] Resend failed for user ${userId}:`, emailResult.error);
                return res.status(500).json({
                    success: false,
                    error: 'Gagal mengirim ulang kode. Coba lagi nanti'
                });
            }

        } catch (error) {
            console.error('[Auth] Resend token error:', error);
            res.status(500).json({
                success: false,
                error: 'Terjadi kesalahan'
            });
        }
    });

    /**
     * GET /api/auth/token-stats (admin only)
     * Get token statistics for dashboard
     */
    app.get('/api/auth/token-stats', async (req, res) => {
        try {
            // Auth check should be done by middleware
            const stats = await dailyTokenService.getTokenStats();
            res.json(stats);
        } catch (error) {
            console.error('[Auth] Token stats error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get token stats'
            });
        }
    });
};
