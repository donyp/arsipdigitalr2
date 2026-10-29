/**
 * Authentication Endpoints
 * Simplified login: username/password only (Daily Token system removed)
 * WITH maintenance mode check - only moderators can login during maintenance
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const tokenAuth = require('./token-auth-service');

const MAINTENANCE_FILE = path.join(__dirname, '../data/maintenance-status.json');

// ===== Login rate limit (Redis-backed if available, else in-memory) =====
const LOGIN_MAX_ATTEMPTS = 3;
const LOGIN_LOCK_MINUTES = 15;
const loginAttempts = new Map();

let redisClient = null;
let redisReady = false;
(async () => {
    if (!process.env.REDIS_HOST && !process.env.REDIS_URL) return;
    try {
        const redis = require('redis');
        const c = process.env.REDIS_URL
            ? redis.createClient({ url: process.env.REDIS_URL })
            : redis.createClient({ host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379, password: process.env.REDIS_PASSWORD });
        c.on('error', () => { redisReady = false; });
        await c.connect();
        redisClient = c;
        redisReady = true;
    } catch (e) { redisReady = false; }
})();

async function getLoginAttemptState(key) {
    if (redisReady && redisClient) {
        try {
            const raw = await redisClient.get(`login:attempt:${key}`);
            if (!raw) return { count: 0, lockedUntil: 0 };
            const s = JSON.parse(raw);
            if (s.lockedUntil && s.lockedUntil < Date.now()) {
                await redisClient.del(`login:attempt:${key}`);
                return { count: 0, lockedUntil: 0 };
            }
            return s;
        } catch (e) { /* fall through to memory */ }
    }
    const s = loginAttempts.get(key);
    if (!s) return { count: 0, lockedUntil: 0 };
    if (s.lockedUntil && s.lockedUntil < Date.now()) {
        loginAttempts.delete(key);
        return { count: 0, lockedUntil: 0 };
    }
    return s;
}

async function recordFailedLogin(key) {
    const s = await getLoginAttemptState(key);
    s.count = (s.count || 0) + 1;
    if (s.count >= LOGIN_MAX_ATTEMPTS) {
        s.lockedUntil = Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000;
    }
    if (redisReady && redisClient) {
        try { await redisClient.set(`login:attempt:${key}`, JSON.stringify(s), { EX: LOGIN_LOCK_MINUTES * 60 }); } catch (e) {}
    } else {
        loginAttempts.set(key, s);
    }
    return s;
}

async function clearLoginAttempts(key) {
    if (redisReady && redisClient) {
        try { await redisClient.del(`login:attempt:${key}`); } catch (e) {}
    }
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
            const attemptState = await getLoginAttemptState(attemptKey);
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
                    const s = await recordFailedLogin(attemptKey);
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
                const s = await recordFailedLogin(attemptKey);
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
                const s = await recordFailedLogin(attemptKey);
                return res.status(401).json({
                    success: false,
                    error: 'Username atau password salah',
                    attempts: s.count,
                    maxAttempts: LOGIN_MAX_ATTEMPTS
                });
            }

            console.log(`[Auth] ✅ Password verified for user: ${username}`);

            // ============================================================
            // TOKEN LOGIN HARIAN (2FA email) — gate setelah password valid
            // ============================================================
            const settings = await tokenAuth.getSettings(supabase);
            const scope = tokenAuth.scopeForUser(users);

            if (settings.enabled && scope) {
                // Sudah pernah verifikasi token di periode ini?
                const alreadyVerified = await tokenAuth.hasActiveVerification(supabase, users.id, scope);

                if (!alreadyVerified) {
                    // Belum verifikasi -> minta token.
                    // Buat temp-token (JWT pendek) untuk mengamankan langkah verifikasi.
                    const tempToken = jwt.sign(
                        {
                            userId: users.id,
                            username: users.username,
                            role: users.role,
                            scope,
                            stage: 'pending-token'
                        },
                        process.env.JWT_SECRET,
                        { expiresIn: `${settings.temp_token_ttl_seconds || 600}s` }
                    );

                    // Mask email tujuan token (untuk ditampilkan ke user)
                    const targetEmail = users.role === 'admin_zona'
                        ? users.email
                        : settings.admin_group_email;
                    const maskedEmail = maskEmail(targetEmail || users.email || '');

                    console.log('[Auth] 🔑 Token login diperlukan untuk:', username, '(scope:', scope + ')');

                    return res.json({
                        success: true,
                        requiresToken: true,
                        message: 'Password benar. Masukkan kode token dari email.',
                        tempToken,
                        userId: users.id,
                        username: users.username,
                        role: users.role,
                        maskedEmail,
                        tokenLength: settings.token_length || 6,
                        expiresIn: settings.temp_token_ttl_seconds || 600
                    });
                }
                // else: sudah verifikasi -> lanjutkan issue session penuh
                console.log('[Auth] ✅ User sudah terverifikasi token, lanjut login:', username);
            }

            // Issue sesi penuh (JWT + active_sessions)
            const sessionResult = await issueFullSession(supabase, users, maintenance);
            await clearLoginAttempts(attemptKey);
            return res.json(sessionResult);
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

    /**
     * POST /api/auth/verify-token
     * Verifikasi kode token (langkah 2). Setelah berhasil -> issue sesi penuh.
     */
    app.post('/api/auth/verify-token', async (req, res) => {
        try {
            const { tempToken: tmpToken, token } = req.body;
            if (!tmpToken || !token) {
                return res.status(400).json({ success: false, error: 'Kode token diperlukan' });
            }

            let decoded;
            try {
                decoded = jwt.verify(tmpToken, process.env.JWT_SECRET);
            } catch (e) {
                return res.status(401).json({ success: false, error: 'Sesi verifikasi berakhir. Silakan login ulang.', reason: 'temp_expired' });
            }

            if (decoded.stage !== 'pending-token') {
                return res.status(401).json({ success: false, error: 'Sesi verifikasi tidak valid.', reason: 'bad_stage' });
            }

            const { data: users, error: fetchError } = await supabase
                .from('users')
                .select('id, username, email, password_hash, role, zona_id, is_active')
                .eq('id', decoded.userId)
                .single();

            if (fetchError || !users) {
                return res.status(401).json({ success: false, error: 'User tidak ditemukan.' });
            }

            const scope = tokenAuth.scopeForUser(users);
            if (!scope) {
                return res.status(400).json({ success: false, error: 'Role user tidak memerlukan token.' });
            }

            const verify = await tokenAuth.verifyTokenForScope(supabase, scope, token);
            if (!verify.ok) {
                try {
                    await supabase.from('auth_token_logs').insert([{ action: 'verify_fail', scope, user_id: users.id, detail: verify.reason }]);
                } catch (e) {}
                const msg = verify.reason === 'expired'
                    ? 'Kode sudah kedaluwarsa. Gunakan kode terbaru dari email.'
                    : 'Silahkan cek kembali token yang terkirim';
                return res.status(401).json({ success: false, error: msg, reason: verify.reason });
            }

            await tokenAuth.markUserVerified(supabase, verify.tokenId, users.id);
            try {
                await supabase.from('auth_token_logs').insert([{ action: 'verify_ok', scope, user_id: users.id, email: users.email }]);
            } catch (e) {}

            const result = await issueFullSession(supabase, users, { isActive: false, allowedRole: 'moderator' });
            return res.json(result);
        } catch (error) {
            console.error('[Auth] verify-token error:', error.message);
            return res.status(500).json({ success: false, error: 'Silahkan cek kembali token yang terkirim' });
        }
    });

    /**
     * GET /api/auth/token/status — status token + daftar user (mod/SA only).
     */
    app.get('/api/auth/token/status', async (req, res) => {
        try {
            if (!checkAdmin(req, res)) return;

            const status = await tokenAuth.listTokenStatus(supabase);
            return res.json({ success: true, ...status });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'Server error' });
        }
    });

    /**
     * PUT /api/auth/token/settings — update pengaturan token (mod/SA only).
     */
    app.put('/api/auth/token/settings', async (req, res) => {
        try {
            if (!checkAdmin(req, res)) return;

            const { enabled, admin_group_email, auto_logout_time, temp_token_ttl_seconds, token_length } = req.body || {};
            const patch = {};
            if (typeof enabled === 'boolean') patch.enabled = enabled;
            if (admin_group_email !== undefined) patch.admin_group_email = String(admin_group_email);
            if (auto_logout_time !== undefined) patch.auto_logout_time = String(auto_logout_time);
            if (temp_token_ttl_seconds !== undefined) patch.temp_token_ttl_seconds = Number(temp_token_ttl_seconds);
            if (token_length !== undefined) patch.token_length = Number(token_length);

            const settings = await tokenAuth.saveSettings(supabase, patch);
            return res.json({ success: true, settings });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/auth/token/generate-now — generate + kirim semua token (mod/SA only).
     */
    app.post('/api/auth/token/generate-now', async (req, res) => {
        try {
            if (!checkAdmin(req, res)) return;

            const r = await tokenAuth.generateAndSendTokens(supabase);
            return res.json({ success: true, ...r });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/auth/token/resend — kirim ulang token untuk user tertentu (mod/SA only).
     * Body: { userId }
     */
    app.post('/api/auth/token/resend', async (req, res) => {
        try {
            if (!checkAdmin(req, res)) return;

            const { userId } = req.body || {};
            if (!userId) return res.status(400).json({ success: false, error: 'userId diperlukan' });

            const r = await tokenAuth.resendTokenForUser(supabase, userId);
            return res.json({ success: true, ...r });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/auth/forgot-password — kirim link reset password ke email.
     * Body: { email }
     * Jika email tidak terdaftar -> gagal (404). Jika terdaftar -> kirim link.
     */
    app.post('/api/auth/forgot-password', async (req, res) => {
        try {
            const { email } = req.body || {};
            if (!email || typeof email !== 'string') {
                return res.status(400).json({ success: false, error: 'Email harus diisi' });
            }
            const cleanEmail = email.trim().toLowerCase();

            // Cari user berdasarkan email
            const { data: user, error } = await supabase
                .from('users')
                .select('id, username, email, name, is_active')
                .eq('email', cleanEmail)
                .maybeSingle();

            if (error || !user) {
                return res.status(404).json({ success: false, error: 'Email tidak terdaftar' });
            }
            if (user.is_active === false) {
                return res.status(403).json({ success: false, error: 'Email akun tidak aktif' });
            }

            // Buat reset token (JWT 1 jam)
            const resetToken = jwt.sign(
                { userId: user.id, email: user.email, purpose: 'password-reset' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            // Kirim email via Resend
            const { Resend } = require('resend');
            const apiKey = process.env.RESEND_API_KEY;
            const from = process.env.RESEND_FROM_EMAIL || 'noreply@arsipdigitalanka.cloud';
            if (!apiKey) {
                return res.status(500).json({ success: false, error: 'Email service belum dikonfigurasi' });
            }
            const resend = new Resend(apiKey);
            const baseUrl = process.env.APP_BASE_URL || (req.protocol + '://' + req.get('host'));
            const resetLink = `${baseUrl}/reset?token=${encodeURIComponent(resetToken)}`;

            const html = `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:24px 0;">
                <tr><td align="center">
                    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
                        <tr><td style="background:#3d3b6b;padding:20px 28px;color:#ffffff;font-size:20px;font-weight:900;">ARSIP DIGITAL ANKA</td></tr>
                        <tr><td style="padding:28px;">
                            <p style="color:#1f2937;font-size:15px;margin:0 0 4px;">Halo <strong>${user.name || user.username}</strong>,</p>
                            <p style="color:#4b5563;font-size:14px;margin:0 0 24px;">Kami menerima permintaan reset password untuk akun Anda. Klik tombol di bawah untuk mengatur password baru.</p>
                            <p style="text-align:center;margin:24px 0;">
                                <a href="${resetLink}" style="display:inline-block;background:#3d3b6b;color:#ffffff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">Reset Password</a>
                            </p>
                            <p style="color:#9ca3af;font-size:12px;margin:24px 0 0;">Link ini berlaku selama <strong>1 jam</strong>. Jika Anda tidak meminta reset password, abaikan email ini.</p>
                        </td></tr>
                        <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 28px;color:#9ca3af;font-size:11px;text-align:center;">Email ini dikirim otomatis. Mohon tidak membalas.</td></tr>
                    </table>
                </td></tr>
            </table>`;

            const { data, error: sendErr } = await resend.emails.send({
                from,
                to: cleanEmail,
                subject: '🔐 Reset Password - Arsip Digital ANKA',
                html
            });
            if (sendErr) throw new Error('Gagal kirim email: ' + (sendErr.message || JSON.stringify(sendErr)));

            try {
                await supabase.from('auth_token_logs').insert([{
                    action: 'forgot_password',
                    scope: 'password-reset',
                    user_id: user.id,
                    email: cleanEmail,
                    detail: 'reset link sent'
                }]);
            } catch (e) { /* audit best-effort */ }

            return res.json({ success: true, message: 'Link reset password telah dikirim ke email Anda.' });
        } catch (error) {
            console.error('[ForgotPassword] Error:', error.message);
            return res.status(500).json({ success: false, error: 'Gagal memproses permintaan: ' + (error.message || 'unknown') });
        }
    });

    /**
     * POST /api/auth/reset-password — set password baru dengan token reset.
     * Body: { token, newPassword }
     */
    app.post('/api/auth/reset-password', async (req, res) => {
        try {
            const { token, newPassword } = req.body || {};
            if (!token || !newPassword) {
                return res.status(400).json({ success: false, error: 'Token dan password baru diperlukan' });
            }
            if (String(newPassword).length < 6) {
                return res.status(400).json({ success: false, error: 'Password minimal 6 karakter' });
            }

            let decoded;
            try {
                decoded = jwt.verify(token, process.env.JWT_SECRET);
            } catch (e) {
                return res.status(400).json({ success: false, error: 'Link reset tidak valid atau sudah kadaluarsa' });
            }
            if (decoded.purpose !== 'password-reset' || !decoded.userId) {
                return res.status(400).json({ success: false, error: 'Token tidak valid' });
            }

            const hash = await bcrypt.hash(newPassword, 10);
            const { error } = await supabase
                .from('users')
                .update({ password_hash: hash })
                .eq('id', decoded.userId);

            if (error) throw new Error(error.message);

            try {
                await supabase.from('auth_token_logs').insert([{
                    action: 'reset_password',
                    scope: 'password-reset',
                    user_id: decoded.userId,
                    email: decoded.email,
                    detail: 'password updated'
                }]);
            } catch (e) { /* audit best-effort */ }

            return res.json({ success: true, message: 'Password berhasil diubah. Silakan login.' });
        } catch (error) {
            console.error('[ResetPassword] Error:', error.message);
            return res.status(500).json({ success: false, error: 'Gagal memproses permintaan: ' + (error.message || 'unknown') });
        }
    });

};

/**
 * Helper: cek Authorization header & role modifier/super_admin.
 * Mengirim response error otomatis bila gagal. Return true bila lolos.
 */
function checkAdmin(req, res) {
    const auth = req.headers.authorization;
    const token = auth && auth.split(' ')[1];
    if (!token) {
        res.status(401).json({ success: false, error: 'Tidak terautentikasi' });
        return false;
    }
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
        res.status(401).json({ success: false, error: 'Tidak terautentikasi' });
        return false;
    }
    if (decoded.role !== 'moderator' && decoded.role !== 'super_admin') {
        res.status(403).json({ success: false, error: 'Akses ditolak' });
        return false;
    }
    return true;
}

/**
 * Issue sesi penuh (JWT + active_sessions) setelah auth sukses / verifikasi token.
 */
async function issueFullSession(supabase, users, maintenance) {
    const crypto = require('crypto');
    const jti = crypto.randomBytes(16).toString('hex');

    const jwtToken = jwt.sign(
        {
            sub: users.id,
            userId: users.id,
            id: users.id,
            username: users.username,
            email: users.email,
            role: users.role || 'user',
            zona_id: users.zona_id || null,
            stage: 'authenticated',
            jti
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    let sessionId = jti;
    try {
        const { data: existing } = await supabase
            .from('active_sessions')
            .select('session_id')
            .eq('session_id', jti);

        if (existing && existing.length > 0) {
            await supabase.from('active_sessions')
                .update({ last_activity: new Date().toISOString() })
                .eq('session_id', jti);
        } else {
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
            if (!insertError && newSession && newSession.length > 0) {
                sessionId = newSession[0].session_id;
            }
        }
    } catch (sessionErr) {
        console.error('[Auth] Session record exception:', sessionErr.message);
    }

    return {
        success: true,
        message: 'Login berhasil',
        token: jwtToken,
        sessionId,
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
    };
}

/** Mask email untuk ditampilkan (contoh: doni***@***.com). */
function maskEmail(email) {
    if (!email) return '';
    const at = email.indexOf('@');
    if (at < 0) return email;
    const local = email.slice(0, at);
    const domain = email.slice(at + 1);
    const maskedLocal = local.length > 3 ? local.slice(0, 3) + '***' : local[0] + '***';
    return `${maskedLocal}@${domain}`;
}


