/**
 * Token Login Harian (Daily Login Token / 2FA Email)
 * ============================================================
 * Konsep:
 *  - Satu token berlaku "terus" (dipakai login berulang) sampai di-reset.
 *  - Reset token mengikuti auto-logout harian: saat jam auto-logout, semua
 *    token lama dinonaktifkan + semua verifikasi user dihapus + sesi lama
 *    di-invalidasi (catat session_invalidations).
 *  - Generate + kirim email dilakukan 1 jam SETELAH auto-logout.
 *  - Token hanya berlaku pada hari itu (expire di auto-logout berikutnya).
 *
 * Scope:
 *  - Admin Zona   : tiap user token sendiri -> dikirim ke email user masing2.
 *  - Moderator/Super Admin : SATU token bersama -> dikirim ke 1 email yang
 *    di-set di dashboard (settings.admin_group_email).
 *
 * Disimpan di tabel system_config key 'token_auth_settings' (JSON) + tabel
 * auth_token_keys / auth_token_verifications / auth_token_logs.
 * ============================================================
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');

const SETTINGS_KEY = 'token_auth_settings';

const DEFAULT_SETTINGS = {
    // Master switch. false = login langsung (tanpa token).
    enabled: false,
    // Email tujuan untuk token bersama moderator/super admin.
    admin_group_email: 'donisugiharto322@gmail.com',
    // Lama token "temp" (untuk menuju form input token) dalam detik.
    temp_token_ttl_seconds: 600,
    // Panjang digit token.
    token_length: 6,
    // Jam auto-logout (dipakai untuk hitung generate = +1 jam).
    auto_logout_time: process.env.AUTO_LOGOUT_TIME || '00:00'
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function mergeDeep(base, patch) {
    if (!patch || typeof patch !== 'object') return base;
    const out = clone(base);
    Object.keys(patch).forEach(k => {
        if (patch[k] !== undefined) out[k] = patch[k];
    });
    return out;
}

function sha256(text) {
    return crypto.createHash('sha256').update(String(text)).digest('hex');
}

/** Generate token angka acak (crypto-secure). */
function generateTokenCode(length = 6) {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return String(crypto.randomInt(min, max + 1));
}

/** Scope token untuk sebuah user. */
function scopeForUser(user) {
    if (user.role === 'admin_zona') return `user:${user.id}`;
    if (user.role === 'moderator' || user.role === 'super_admin') return 'group:moderator_admin';
    return null;
}

async function getSettings(supabase) {
    try {
        const { data, error } = await supabase
            .from('system_config')
            .select('value')
            .eq('key', SETTINGS_KEY)
            .maybeSingle();
        if (error || !data || !data.value) return clone(DEFAULT_SETTINGS);
        const stored = typeof data.value === 'string' ? safeParse(data.value) : data.value;
        return mergeDeep(DEFAULT_SETTINGS, stored || {});
    } catch (e) {
        return clone(DEFAULT_SETTINGS);
    }
}

async function saveSettings(supabase, patch) {
    const current = await getSettings(supabase);
    const next = mergeDeep(current, patch);
    const { error } = await supabase
        .from('system_config')
        .upsert({
            key: SETTINGS_KEY,
            value: next,
            updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
    if (error) throw new Error(`Gagal menyimpan pengaturan token: ${error.message}`);
    return next;
}

function safeParse(str) {
    try { return JSON.parse(str); } catch (e) { return {}; }
}

async function logEvent(supabase, action, meta) {
    try {
        await supabase.from('auth_token_logs').insert([{
            action,
            scope: meta.scope || null,
            user_id: meta.userId || null,
            email: meta.email || null,
            detail: meta.detail || null
        }]);
    } catch (e) { /* audit best-effort */ }
}

/** Kirim email token via Resend. */
async function sendTokenEmail(email, token, { name } = {}) {
    const { Resend } = require('resend');
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL || 'noreply@arsipdigitalanka.cloud';
    if (!apiKey) throw new Error('RESEND_API_KEY belum diatur di .env');
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
        from,
        to: email,
        subject: '🔐 Kode Akses Login Harian - Arsip Digital ANKA',
        html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
            <h2 style="color:#3d3b6b;margin:0 0 8px;">Kode Akses Login Harian</h2>
            <p style="color:#555;margin:0 0 24px;">Halo${name ? ' <strong>' + name + '</strong>' : ''}, gunakan kode di bawah ini untuk login hari ini.</p>
            <div style="background:#f5f7fa;border:1px dashed #3d3b6b;border-radius:12px;padding:24px;text-align:center;">
                <span style="font-size:40px;font-weight:900;letter-spacing:12px;color:#3d3b6b;font-family:monospace;">${token}</span>
            </div>
            <p style="color:#888;font-size:13px;margin-top:24px;">
                Kode hanya berlaku <strong>hari ini</strong>. Jangan bagikan kode ini kepada siapa pun.
            </p>
            <p style="color:#999;font-size:12px;">Email ini dikirim otomatis. Mohon tidak membalas email ini.</p>
        </div>`
    });
    if (error) throw new Error('Resend: ' + (error.message || JSON.stringify(error)));
    return data;
}

/** Buat token aktif baru untuk sebuah scope (nonaktifkan token lama scope tsb). */
async function issueTokenForScope(supabase, scope, email, settings) {
    // Hitung expires_at = auto-logout berikutnya (hari ini jam auto_logout, atau besok bila sudah lewat)
    const expiresAt = nextAutoLogoutDate(settings.auto_logout_time);

    // Nonaktifkan token lama scope ini
    await supabase.from('auth_token_keys')
        .update({ is_active: false, expires_at: new Date().toISOString() })
        .eq('scope', scope)
        .eq('is_active', true);

    const code = generateTokenCode(settings.token_length);
    const hash = sha256(code);

    const { data, error } = await supabase.from('auth_token_keys')
        .insert([{
            scope,
            token_hash: hash,
            token_preview: code.slice(-4),
            expires_at: expiresAt.toISOString(),
            is_active: true,
            email_sent: false,
            email_address: email
        }])
        .select('id');

    if (error) throw new Error('Gagal membuat token: ' + error.message);
    return { tokenId: data[0].id, code, hash, scope, email };
}

/** Hitung waktu auto-logout berikutnya relatif dari sekarang. */
function nextAutoLogoutDate(timeStr) {
    const [h, m] = String(timeStr || '00:00').split(':').map(Number);
    const now = new Date();
    const target = new Date(now);
    target.setHours(h || 0, m || 0, 0, 0);
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
    return target;
}

/** Ambil daftar user yang wajib punya token. */
async function getTokenUsers(supabase) {
    const { data, error } = await supabase
        .from('users')
        .select('id, username, email, name, role, is_active')
        .in('role', ['admin_zona', 'moderator', 'super_admin'])
        .neq('is_active', false);
    if (error) throw new Error('Gagal ambil user: ' + error.message);
    return data || [];
}

/**
 * Reset semua token + verifikasi (dipanggil saat jam auto-logout).
 */
async function resetTokens(supabase) {
    // Nonaktifkan semua token aktif
    await supabase.from('auth_token_keys')
        .update({ is_active: false, expires_at: new Date().toISOString() })
        .eq('is_active', true);

    // Hapus semua verifikasi (Supabase delete butuh filter)
    await supabase.from('auth_token_verifications').delete().gte('id', 1);

    // Catat session_invalidations agar semua sesi lama dipaksa logout
    try {
        await supabase.from('session_invalidations').insert([{
            invalidated_at: new Date().toISOString(),
            reason: 'token_reset_daily'
        }]);
    } catch (e) { /* tabel mungkin belum ada */ }

    await logEvent(supabase, 'reset', { detail: 'daily reset' });
}

/**
 * Generate + kirim token untuk semua scope (dipanggil 1 jam setelah reset).
 */
async function generateAndSendTokens(supabase) {
    const settings = await getSettings(supabase);
    if (!settings.enabled) {
        console.log('[TokenAuth] Generator: sistem token nonaktif (enabled=false), skip.');
        return { generated: 0, sent: 0, results: [] };
    }

    const users = await getTokenUsers(supabase);
    const results = [];
    let generated = 0;
    let sent = 0;

    // Kumpulkan scope unik. admin_zona -> user:<id>; mod/SA -> 1 scope bersama.
    const adminScopes = {};
    const groupUsers = [];

    for (const u of users) {
        const scope = scopeForUser(u);
        if (!scope) continue;
        if (u.role === 'admin_zona') {
            adminScopes[scope] = { user: u, email: u.email || null };
        } else {
            groupUsers.push(u);
        }
    }

    // Token admin zona (masing-masing)
    for (const scope of Object.keys(adminScopes)) {
        const { user, email } = adminScopes[scope];
        try {
            const t = await issueTokenForScope(supabase, scope, email, settings);
            generated++;
            let sentOk = false;
            if (email) {
                try {
                    await sendTokenEmail(email, t.code, { name: user.name || user.username });
                    sentOk = true; sent++;
                    await supabase.from('auth_token_keys').update({ email_sent: true, email_sent_at: new Date().toISOString() }).eq('id', t.tokenId);
                } catch (e) {
                    results.push({ scope, email, error: e.message });
                }
            }
            await logEvent(supabase, 'generate', { scope, userId: user.id, email, detail: sentOk ? 'sent' : (email ? 'send_failed' : 'no_email') });
            results.push({ scope, email, sent: sentOk });
        } catch (e) {
            results.push({ scope, error: e.message });
        }
    }

    // Token bersama moderator/super admin
    if (groupUsers.length > 0) {
        const groupEmail = settings.admin_group_email;
        try {
            const t = await issueTokenForScope(supabase, 'group:moderator_admin', groupEmail, settings);
            generated++;
            let sentOk = false;
            if (groupEmail) {
                try {
                    await sendTokenEmail(groupEmail, t.code, { name: 'Moderator / Super Admin' });
                    sentOk = true; sent++;
                    await supabase.from('auth_token_keys').update({ email_sent: true, email_sent_at: new Date().toISOString() }).eq('id', t.tokenId);
                } catch (e) {
                    results.push({ scope: 'group:moderator_admin', email: groupEmail, error: e.message });
                }
            }
            await logEvent(supabase, 'generate', { scope: 'group:moderator_admin', email: groupEmail, detail: sentOk ? 'sent' : 'send_failed' });
            results.push({ scope: 'group:moderator_admin', email: groupEmail, sent: sentOk });
        } catch (e) {
            results.push({ scope: 'group:moderator_admin', error: e.message });
        }
    }

    return { generated, sent, total: users.length, results };
}

/**
 * Verifikasi kode token untuk sebuah scope.
 * Return { ok, tokenId } | { ok:false }.
 */
async function verifyTokenForScope(supabase, scope, code) {
    const hash = sha256(code);
    const { data, error } = await supabase
        .from('auth_token_keys')
        .select('id, token_hash, expires_at, is_active')
        .eq('scope', scope)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);

    if (error || !data || data.length === 0) return { ok: false, reason: 'no_token' };
    const rec = data[0];

    // Cek expiry (hanya berlaku hari itu)
    if (rec.expires_at && new Date(rec.expires_at).getTime() < Date.now()) {
        return { ok: false, reason: 'expired' };
    }
    // constant-time compare hash
    const a = Buffer.from(hash);
    const b = Buffer.from(rec.token_hash);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return { ok: false, reason: 'invalid' };
    }
    return { ok: true, tokenId: rec.id };
}

/** Apakah user sudah terverifikasi untuk token aktif scope-nya? */
async function hasActiveVerification(supabase, userId, scope) {
    const { data: keys } = await supabase
        .from('auth_token_keys')
        .select('id')
        .eq('scope', scope)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);
    if (!keys || keys.length === 0) return false;

    const { data: ver } = await supabase
        .from('auth_token_verifications')
        .select('id')
        .eq('token_id', keys[0].id)
        .eq('user_id', userId)
        .limit(1);
    return ver && ver.length > 0;
}

async function markUserVerified(supabase, tokenId, userId) {
    const { error } = await supabase.from('auth_token_verifications')
        .upsert({ token_id: tokenId, user_id: userId }, { onConflict: 'token_id,user_id' });
    return !error;
}

/** Ambil status token (untuk dashboard). */
async function listTokenStatus(supabase) {
    const users = await getTokenUsers(supabase);
    const { data: keys } = await supabase
        .from('auth_token_keys')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

    const settings = await getSettings(supabase);

    const rows = [];
    for (const u of users) {
        const scope = scopeForUser(u);
        const key = (keys || []).find(k => k.scope === scope);
        let verified = false;
        if (key) verified = await hasActiveVerification(supabase, u.id, scope);
        rows.push({
            userId: u.id,
            username: u.username,
            name: u.name,
            email: u.email,
            role: u.role,
            scope,
            hasToken: !!key,
            tokenPreview: key ? key.token_preview : null,
            emailSent: key ? key.email_sent : false,
            emailSentAt: key ? key.email_sent_at : null,
            expiresAt: key ? key.expires_at : null,
            verified
        });
    }
    return { settings, rows };
}

/** Kirim ulang token untuk user tertentu (admin only). */
async function resendTokenForUser(supabase, userId) {
    const { data: users, error } = await supabase
        .from('users')
        .select('id, username, email, name, role, is_active')
        .eq('id', userId)
        .single();

    if (error || !users) throw new Error('User tidak ditemukan');
    const scope = scopeForUser(users);
    if (!scope) throw new Error('Role user tidak memerlukan token');

    const settings = await getSettings(supabase);

    // Buat token baru (token lama di-scope ini otomatis dinonaktifkan + verifikasi lama tetap valid
    // sampai reset harian). Kirim token baru ke email tujuan.
    const t = await issueTokenForScope(supabase, scope, users.email || settings.admin_group_email, settings);
    const emailTarget = users.role === 'admin_zona'
        ? users.email
        : settings.admin_group_email;

    if (emailTarget) {
        await sendTokenEmail(emailTarget, t.code, { name: users.name || users.username });
        await supabase.from('auth_token_keys').update({ email_sent: true, email_sent_at: new Date().toISOString() }).eq('id', t.tokenId);
    }
    await logEvent(supabase, 'resend', { scope, userId: users.id, email: emailTarget, detail: 'manual resend' });
    return { scope, email: emailTarget, sent: !!emailTarget };
}

/** Scheduler harian: reset @ auto_logout, generate @ auto_logout+1h. */
function startTokenScheduler(supabase) {
    const time = process.env.AUTO_LOGOUT_TIME || '00:00';
    const [h, m] = time.split(':').map(Number);
    const gh = ((h || 0) + 1) % 24;
    const gm = m || 0;

    const resetCron = `${gm} ${h} * * *`;
    const generateCron = `${gm} ${gh} * * *`;

    try {
        cron.schedule(resetCron, async () => {
            console.log(`[TokenAuth] [CRON] Reset token @ ${time}`);
            try {
                const settings = await getSettings(supabase);
                if (!settings.enabled) { console.log('[TokenAuth] Reset skip (disabled)'); return; }
                await resetTokens(supabase);
            } catch (e) { console.error('[TokenAuth] Reset error:', e.message); }
        });
        console.log(`[TokenAuth] Scheduler reset terdaftar: "${resetCron}"`);
    } catch (e) { console.error('[TokenAuth] Gagal daftar cron reset:', e.message); }

    try {
        cron.schedule(generateCron, async () => {
            console.log(`[TokenAuth] [CRON] Generate + kirim @ ${String(gh).padStart(2, '0')}:${String(gm).padStart(2, '0')}`);
            try {
                const r = await generateAndSendTokens(supabase);
                console.log(`[TokenAuth] Generate selesai: ${r.generated} dibuat, ${r.sent} terkirim`);
            } catch (e) { console.error('[TokenAuth] Generate error:', e.message); }
        });
        console.log(`[TokenAuth] Scheduler generate terdaftar: "${generateCron}"`);
    } catch (e) { console.error('[TokenAuth] Gagal daftar cron generate:', e.message); }
}

module.exports = {
    SETTINGS_KEY,
    DEFAULT_SETTINGS,
    getSettings,
    saveSettings,
    scopeForUser,
    sha256,
    generateTokenCode,
    verifyTokenForScope,
    hasActiveVerification,
    markUserVerified,
    generateAndSendTokens,
    resetTokens,
    resendTokenForUser,
    listTokenStatus,
    sendTokenEmail,
    startTokenScheduler,
    nextAutoLogoutDate
};