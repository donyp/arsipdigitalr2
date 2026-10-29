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
 *  - Moderator/Super Admin : tiap user token SENDIRI (berbeda-beda), namun
 *    semuanya dikirim dalam 1 email gabungan ke email induk
 *    (settings.admin_group_email).
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

/** Scope token untuk sebuah user.
 *  Setiap user wajib token (admin_zona, moderator, super_admin) punya token SENDIRI.
 *  Email tujuan tetap bisa diarahkan ke 1 email induk untuk moderator/super_admin
 *  (lihat generateAndSendTokens / resendTokenForUser). */
function scopeForUser(user) {
    if (user.role === 'admin_zona' || user.role === 'moderator' || user.role === 'super_admin') {
        return `user:${user.id}`;
    }
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

/** Render kotak digit token (untuk email, siap print). */
function digitBoxesHtml(token) {
    return String(token).split('').map((d) => (
        `<span style="display:inline-block;width:44px;height:54px;line-height:54px;margin:0 4px;border:2px solid #3d3b6b;border-radius:8px;font-family:monospace;font-size:32px;font-weight:900;color:#3d3b6b;text-align:center;">${d}</span>`
    )).join('');
}

/** Kirim email token via Resend. */
async function sendTokenEmail(email, token, { name, username, expiresAt } = {}) {
    const { Resend } = require('resend');
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL || 'noreply@arsipdigitalanka.cloud';
    if (!apiKey) throw new Error('RESEND_API_KEY belum diatur di .env');
    const resend = new Resend(apiKey);

    // Format nama akun + tanggal kedaluwarsa untuk tampilan/print
    const displayName = name || username || 'Pengguna';
    const expiryText = expiresAt
        ? new Date(expiresAt).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })
        : '-';

    const html = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:24px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
                    <tr>
                        <td style="background:#3d3b6b;padding:20px 28px;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="color:#ffffff;font-size:20px;font-weight:900;letter-spacing:0.5px;">ARSIP DIGITAL ANKA</td>
                                    <td align="right" style="color:#c7d2fe;font-size:12px;font-weight:700;">KODE AKSES LOGIN</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:28px;">
                            <p style="color:#1f2937;font-size:15px;margin:0 0 4px;">Halo <strong>${displayName}</strong>${username ? ' <span style="color:#6b7280;">(@' + username + ')</span>' : ''},</p>
                            <p style="color:#4b5563;font-size:14px;margin:0 0 24px;">Berikut kode akses login harian Anda untuk hari ini.</p>

                            <!-- Kode token (siap print) -->
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;">
                                <tr><td align="center" style="padding:20px 16px 0;">
                                    ${digitBoxesHtml(token)}
                                </td></tr>
                                <tr><td align="center" style="padding:12px 16px 20px;color:#6b7280;font-size:12px;">
                                    Masukkan kode ${String(token).length} digit ini pada halaman login
                                </td></tr>
                            </table>

                            <!-- Info kartu (siap print) -->
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
                                <tr style="background:#f3f4f6;">
                                    <td style="padding:10px 16px;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Pemilik Akun</td>
                                    <td style="padding:10px 16px;color:#111827;font-size:13px;font-weight:700;">${displayName}</td>
                                </tr>
                                <tr>
                                    <td style="padding:10px 16px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Berlaku Hingga</td>
                                    <td style="padding:10px 16px;border-top:1px solid #e5e7eb;color:#111827;font-size:13px;">${expiryText}</td>
                                </tr>
                                <tr style="background:#f3f4f6;">
                                    <td style="padding:10px 16px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Status</td>
                                    <td style="padding:10px 16px;border-top:1px solid #e5e7eb;color:#047857;font-size:13px;font-weight:700;">Aktif</td>
                                </tr>
                            </table>

                            <p style="color:#9ca3af;font-size:12px;margin:24px 0 0;">Kode hanya berlaku <strong>hari ini</strong> dan akan otomatis kedaluwarsa saat jam reset harian. Jangan bagikan kode ini kepada siapa pun.</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 28px;color:#9ca3af;font-size:11px;text-align:center;">
                            Email ini dikirim otomatis oleh sistem Arsip Digital ANKA. Mohon tidak membalas email ini.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>`;

    const { data, error } = await resend.emails.send({
        from,
        to: email,
        subject: `🔐 Kode Akses Login Harian ${displayName} - Arsip Digital ANKA`,
        html
    });
    if (error) throw new Error('Resend: ' + (error.message || JSON.stringify(error)));
    return data;
}

/**
 * Kirim SATU email berisi daftar token untuk banyak user (moderator/super admin),
 * agar token beda-beda per user tetap terkumpul dalam 1 pesan ke email induk.
 * entries: [{ name, username, token, expiresAt }]
 */
async function sendGroupTokenEmail(email, entries) {
    const { Resend } = require('resend');
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL || 'noreply@arsipdigitalanka.cloud';
    if (!apiKey) throw new Error('RESEND_API_KEY belum diatur di .env');
    const resend = new Resend(apiKey);

    const expiryText = (entries.length > 0 && entries[0].expiresAt)
        ? new Date(entries[0].expiresAt).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })
        : '-';

    const rows = entries.map((e) => `
        <tr>
            <td style="padding:16px;border-top:1px solid #e5e7eb;">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td>
                            <div style="color:#111827;font-size:14px;font-weight:700;">${e.name}</div>
                            <div style="color:#6b7280;font-size:12px;">@${e.username}</div>
                        </td>
                        <td align="right" style="color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Kode</td>
                    </tr>
                </table>
                <div style="margin-top:10px;">${digitBoxesHtml(e.token)}</div>
            </td>
        </tr>
    `).join('');

    const html = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:24px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
                    <tr>
                        <td style="background:#3d3b6b;padding:20px 28px;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="color:#ffffff;font-size:20px;font-weight:900;letter-spacing:0.5px;">ARSIP DIGITAL ANKA</td>
                                    <td align="right" style="color:#c7d2fe;font-size:12px;font-weight:700;">KODE AKSES LOGIN</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:28px;">
                            <p style="color:#1f2937;font-size:15px;margin:0 0 4px;">Daftar Kode Akses Login Harian</p>
                            <p style="color:#4b5563;font-size:14px;margin:0 0 24px;">Berikut kode akses untuk moderator &amp; super admin. Setiap akun memiliki kode yang berbeda.</p>

                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
                                ${rows}
                            </table>

                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
                                <tr>
                                    <td style="padding:10px 16px;background:#f3f4f6;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Berlaku Hingga</td>
                                    <td style="padding:10px 16px;background:#f3f4f6;color:#111827;font-size:13px;">${expiryText}</td>
                                </tr>
                            </table>

                            <p style="color:#9ca3af;font-size:12px;margin:24px 0 0;">Kode hanya berlaku <strong>hari ini</strong> dan akan otomatis kedaluwarsa saat jam reset harian. Jangan bagikan kode ini kepada siapa pun.</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 28px;color:#9ca3af;font-size:11px;text-align:center;">
                            Email ini dikirim otomatis oleh sistem Arsip Digital ANKA. Mohon tidak membalas email ini.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>`;

    const { data, error } = await resend.emails.send({
        from,
        to: email,
        subject: `🔐 Daftar Kode Akses Login Harian - Arsip Digital ANKA`,
        html
    });
    if (error) throw new Error('Resend: ' + (error.message || JSON.stringify(error)));
    return data;
}

/** Buat token aktif baru untuk sebuah scope (nonaktifkan token lama scope tsb).
 *  Catatan: tabel auth_token_keys punya kolom scope UNIQUE, jadi pakai UPSERT
 *  (onConflict 'scope') agar token lama di-scope tsb ditimpa, bukan insert
 *  baru yang memicu duplicate-key error. */
async function issueTokenForScope(supabase, scope, email, settings) {
    // Hitung expires_at = auto-logout berikutnya (hari ini jam auto_logout, atau besok bila sudah lewat)
    const expiresAt = nextAutoLogoutDate(settings.auto_logout_time);

    // Nonaktifkan token lama scope ini (best-effort; tetap ada untuk berjaga-jaga)
    await supabase.from('auth_token_keys')
        .update({ is_active: false, expires_at: new Date().toISOString() })
        .eq('scope', scope)
        .eq('is_active', true);

    const code = generateTokenCode(settings.token_length);
    const hash = sha256(code);

    const { data, error } = await supabase.from('auth_token_keys')
        .upsert([{
            scope,
            token_hash: hash,
            token_preview: code.slice(-4),
            expires_at: expiresAt.toISOString(),
            is_active: true,
            email_sent: false,
            email_sent_at: null,
            email_address: email
        }], { onConflict: 'scope' })
        .select('id');

    if (error) throw new Error('Token gagal dibuat: ' + error.message);
    return { tokenId: data[0].id, code, hash, scope, email, expiresAt: expiresAt.toISOString() };
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

/** Ambil daftar user yang wajib punya token.
 *  Catatan: pakai .or() agar user dengan is_active NULL tetap ikut
 *  (PostgREST .neq() mengecualikan baris NULL). */
async function getTokenUsers(supabase) {
    const { data, error } = await supabase
        .from('users')
        .select('id, username, email, name, role, is_active')
        .in('role', ['admin_zona', 'moderator', 'super_admin'])
        .or('is_active.eq.true,is_active.is.null');
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
        return { generated: 0, sent: 0, total: 0, disabled: true, results: [] };
    }

    const users = await getTokenUsers(supabase);
    const results = [];
    let generated = 0;
    let sent = 0;

    // Token moderator/super admin dikumpulkan dulu, dikirim 1 email gabungan.
    const groupEntries = [];

    for (const u of users) {
        const scope = scopeForUser(u);
        if (!scope) continue;

        if (u.role === 'admin_zona') {
            // Admin zona: email masing-masing.
            const email = u.email || null;
            try {
                const t = await issueTokenForScope(supabase, scope, email, settings);
                generated++;
                let sentOk = false;
                if (email) {
                    try {
                        await (module.exports.sendTokenEmail || sendTokenEmail)(email, t.code, {
                            name: u.name || u.username,
                            username: u.username,
                            expiresAt: t.expiresAt || null
                        });
                        sentOk = true; sent++;
                        await supabase.from('auth_token_keys').update({ email_sent: true, email_sent_at: new Date().toISOString() }).eq('id', t.tokenId);
                    } catch (e) {
                        results.push({ scope, userId: u.id, email, error: e.message });
                    }
                }
                await logEvent(supabase, 'generate', { scope, userId: u.id, email, detail: sentOk ? 'sent' : (email ? 'send_failed' : 'no_email') });
                results.push({ scope, userId: u.id, email, sent: sentOk, role: u.role });
            } catch (e) {
                results.push({ scope, userId: u.id, error: e.message });
            }
        } else {
            // Moderator / Super Admin: token beda per user, dikirim 1 email ke email induk.
            const email = settings.admin_group_email || u.email || null;
            try {
                const t = await issueTokenForScope(supabase, scope, email, settings);
                generated++;
                groupEntries.push({
                    name: u.name || u.username,
                    username: u.username,
                    token: t.code,
                    expiresAt: t.expiresAt || null,
                    tokenId: t.tokenId,
                    scope,
                    userId: u.id,
                    role: u.role
                });
            } catch (e) {
                results.push({ scope, userId: u.id, error: e.message });
            }
        }
    }

    // Kirim 1 email gabungan untuk semua moderator/super admin.
    if (groupEntries.length > 0) {
        const groupEmail = settings.admin_group_email || groupEntries[0].email;
        if (groupEmail) {
            try {
                await (module.exports.sendGroupTokenEmail || sendGroupTokenEmail)(groupEmail, groupEntries);
                sent++;
                for (const g of groupEntries) {
                    await supabase.from('auth_token_keys').update({ email_sent: true, email_sent_at: new Date().toISOString() }).eq('id', g.tokenId);
                }
                await logEvent(supabase, 'generate', { email: groupEmail, detail: 'sent_group', scope: 'group:moderator_admin' });
                results.push({ scope: 'group:moderator_admin', email: groupEmail, sent: true, role: 'moderator_admin', count: groupEntries.length });
            } catch (e) {
                for (const g of groupEntries) {
                    results.push({ scope: g.scope, userId: g.userId, email: groupEmail, error: e.message });
                }
            }
        } else {
            for (const g of groupEntries) {
                results.push({ scope: g.scope, userId: g.userId, email: null, sent: false, role: g.role, detail: 'no_email' });
            }
        }
    }

    return { generated, sent, total: users.length, disabled: false, results };
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

/** Apakah user sudah terverifikasi untuk token aktif scope-nya?
 *  Return false bila belum, atau timestamp string (verified_at) bila sudah. */
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
        .select('id, verified_at')
        .eq('token_id', keys[0].id)
        .eq('user_id', userId)
        .limit(1);
    if (!ver || ver.length === 0) return false;
    return ver[0].verified_at || true;
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
        let verifiedAt = null;
        if (key) {
            const v = await hasActiveVerification(supabase, u.id, scope);
            verified = !!v;
            verifiedAt = (typeof v === 'string') ? v : null;
        }
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
            verified,
            verifiedAt
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
    
    // PENTING: Cek apakah sistem token login aktif. Jika disabled, jangan kirim email.
    if (!settings.enabled) {
        console.log('[TokenAuth] Resend: sistem token nonaktif (enabled=false), skip email.');
        return { scope, email: null, sent: false, disabled: true, detail: 'sistem token nonaktif' };
    }

    // Buat token baru (token lama di-scope ini otomatis dinonaktifkan + verifikasi lama tetap valid
    // sampai reset harian). Kirim token baru ke email tujuan.
    const t = await issueTokenForScope(supabase, scope, users.email || settings.admin_group_email, settings);
    const emailTarget = users.role === 'admin_zona'
        ? users.email
        : settings.admin_group_email;

    if (emailTarget) {
        await (module.exports.sendTokenEmail || sendTokenEmail)(emailTarget, t.code, { name: users.name || users.username, username: users.username, expiresAt: t.expiresAt || null });
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
    sendGroupTokenEmail,
    startTokenScheduler,
    nextAutoLogoutDate
};