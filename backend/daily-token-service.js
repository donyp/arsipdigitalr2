/**
 * Daily Token Service
 * Handles generation, validation, and email delivery of daily 5-digit tokens
 */

const { Resend } = require('resend');

class DailyTokenService {
    constructor(supabaseClient, resendApiKey, fromEmail, adminTokenEmail = null) {
        this.supabase = supabaseClient;
        this.adminTokenEmail = adminTokenEmail || process.env.ADMIN_TOKEN_EMAIL;
        
        // Check if API key is valid (not placeholder)
        const isValidKey = resendApiKey && 
                          resendApiKey.startsWith('re_') && 
                          resendApiKey.length > 20;
        
        if (isValidKey) {
            this.resend = new Resend(resendApiKey);
            this.emailsEnabled = true;
            console.log('[DailyToken] ✅ Resend email service initialized');
            if (this.adminTokenEmail) {
                console.log(`[DailyToken] ✅ Admin token email: ${this.adminTokenEmail}`);
            }
        } else {
            console.warn('[DailyToken] ⚠️  RESEND_API_KEY not configured - email sending disabled');
            console.warn('[DailyToken] To enable emails:');
            console.warn('[DailyToken]   1. Check Railway dashboard for RESEND_API_KEY');
            console.warn('[DailyToken]   2. Get API key from https://resend.com/api-keys');
            console.warn('[DailyToken]   3. Add to Railway environment variables');
            this.resend = null;
            this.emailsEnabled = false;
        }
        
        this.fromEmail = fromEmail;
        this.MAX_ATTEMPTS = 3;
        this.LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
    }

    /**
     * Generate a random 5-digit token
     */
    generateToken() {
        return Math.floor(10000 + Math.random() * 90000).toString();
    }

    /**
     * Create daily token for a user
     */
    async createDailyToken(userId, userEmail) {
        try {
            // Generate unique token
            let token;
            let exists = true;
            while (exists) {
                token = this.generateToken();
                const { data } = await this.supabase
                    .from('daily_login_tokens')
                    .select('id')
                    .eq('token', token)
                    .single();
                exists = !!data;
            }

            // Calculate expiry (24 hours from now)
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24);

            // Insert token into database
            const { data, error } = await this.supabase
                .from('daily_login_tokens')
                .insert({
                    user_id: userId,
                    token,
                    expires_at: expiresAt.toISOString(),
                    email_address: userEmail,
                    email_sent: false,
                    token_attempts: 0,
                    is_locked: false
                })
                .select();

            if (error) {
                console.error('[DailyToken] Error creating token:', error);
                return { success: false, error: error.message };
            }

            return {
                success: true,
                tokenId: data[0].id,
                token,
                expiresAt: data[0].expires_at
            };

        } catch (error) {
            console.error('[DailyToken] Exception creating token:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send token via email using Resend with modern fancy template
     */
    async sendTokenEmail(userId, userEmail, token, userName = 'User', userRole = 'user') {
        try {
            if (!userEmail || !userEmail.includes('@')) {
                console.warn(`[DailyToken] Invalid email for user ${userId}: ${userEmail}`);
                return { success: false, error: 'Invalid email address' };
            }

            // Check if emails are disabled
            if (!this.emailsEnabled || !this.resend) {
                console.warn(`[DailyToken] ⚠️ Email sending is DISABLED - Resend not configured`);
                console.log(`[DailyToken] 📧 Token for user ${userId} (${userEmail}): ${token}`);
                console.log(`[DailyToken] In development, use token above for testing`);
                return { success: true, emailId: 'dev-mode', debug: true };
            }

            const subject = '🔐 Kode Akses Login Harian - Arsip Digital Anka';
            
            // Modern fancy HTML email template
            const htmlContent = `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kode Akses Login</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 580px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 30px;
            text-align: center;
            color: white;
        }
        .header-logo {
            display: inline-block;
            width: 50px;
            height: 50px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 15px;
            font-size: 28px;
        }
        .header h1 {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 5px;
            letter-spacing: -0.5px;
        }
        .header p {
            font-size: 14px;
            opacity: 0.9;
        }
        .content {
            padding: 40px 30px;
        }
        .greeting {
            font-size: 16px;
            color: #333;
            margin-bottom: 10px;
            line-height: 1.5;
        }
        .greeting strong { color: #667eea; }
        .description {
            font-size: 14px;
            color: #666;
            line-height: 1.6;
            margin-bottom: 30px;
        }
        .token-section {
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%);
            border: 2px solid #667eea;
            border-radius: 12px;
            padding: 25px;
            text-align: center;
            margin-bottom: 30px;
        }
        .token-label {
            font-size: 12px;
            font-weight: 600;
            color: #667eea;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 12px;
        }
        .token-display {
            font-family: 'Courier New', 'Monaco', monospace;
            font-size: 44px;
            font-weight: 700;
            color: #667eea;
            letter-spacing: 8px;
            margin-bottom: 12px;
            user-select: all;
        }
        .token-validity {
            font-size: 13px;
            color: #999;
            font-weight: 500;
        }
        .info-box {
            background: #f8f9fa;
            border-left: 4px solid #ff9800;
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 4px;
        }
        .info-box .title {
            font-weight: 600;
            color: #ff9800;
            margin-bottom: 8px;
            font-size: 14px;
        }
        .info-box ul {
            list-style: none;
            font-size: 13px;
            color: #555;
            line-height: 1.8;
        }
        .info-box li {
            margin-bottom: 5px;
            padding-left: 20px;
            position: relative;
        }
        .info-box li:before {
            content: "✓";
            position: absolute;
            left: 0;
            color: #ff9800;
            font-weight: bold;
        }
        .cta-section {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
        }
        .support-text {
            font-size: 13px;
            color: #666;
            line-height: 1.6;
        }
        .footer {
            background: #f8f9fa;
            padding: 20px 30px;
            text-align: center;
            border-top: 1px solid #eee;
        }
        .footer p {
            font-size: 12px;
            color: #999;
            margin: 5px 0;
            line-height: 1.5;
        }
        .footer-logo {
            display: inline-block;
            font-weight: 700;
            color: #667eea;
            font-size: 14px;
            margin-top: 10px;
        }
        @media (max-width: 600px) {
            .header { padding: 30px 20px; }
            .header h1 { font-size: 24px; }
            .content { padding: 25px 20px; }
            .token-display { font-size: 36px; letter-spacing: 4px; }
            .container { border-radius: 12px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="header-logo">🔐</div>
            <h1>Kode Akses Login</h1>
            <p>Arsip Digital Anka</p>
        </div>

        <!-- Content -->
        <div class="content">
            <!-- Greeting -->
            <div class="greeting">
                Halo <strong>${userName}</strong>,
            </div>
            
            <div class="description">
                Berikut adalah kode akses login harian Anda untuk sistem <strong>Arsip Digital Anka</strong>. Gunakan kode ini untuk masuk ke dashboard administratif.
            </div>

            <!-- Token Display -->
            <div class="token-section">
                <div class="token-label">Kode Akses (5 Digit)</div>
                <div class="token-display">${token}</div>
                <div class="token-validity">⏱️ Berlaku selama 24 jam</div>
            </div>

            <!-- Security Info -->
            <div class="info-box">
                <div class="title">⚡ Informasi Penting</div>
                <ul>
                    <li>Kode ini hanya berlaku selama 24 jam ke depan</li>
                    <li>Jangan bagikan kode ini kepada siapapun</li>
                    <li>Kode baru akan dikirim otomatis setiap hari jam 04:00</li>
                    <li>Sistem akan logout otomatis setiap hari jam 00:00</li>
                </ul>
            </div>

            <!-- CTA Section -->
            <div class="cta-section">
                <div class="support-text">
                    <strong>Memerlukan bantuan?</strong><br>
                    Jika Anda tidak meminta kode ini atau mengalami masalah, hubungi tim support kami segera.
                </div>
            </div>
        </div>

        <!-- Footer -->
        <div class="footer">
            <p>Email ini dikirim otomatis dan tidak perlu dibalas</p>
            <p>© ${new Date().getFullYear()} <span class="footer-logo">Arsip Digital Anka</span></p>
            <p style="margin-top: 8px; font-size: 11px;">Perlindungan data: Dokumen ini berisi informasi sensitif. Jaga privasi Anda.</p>
        </div>
    </div>
</body>
</html>
            `;

            const { data, error } = await this.resend.emails.send({
                from: this.fromEmail,
                to: userEmail,
                subject,
                html: htmlContent
            });

            if (error) {
                console.error('[DailyToken] Resend error:', error);
                return { success: false, error: error.message };
            }

            // Update email_sent flag in database
            await this.supabase
                .from('daily_login_tokens')
                .update({
                    email_sent: true,
                    email_sent_at: new Date().toISOString()
                })
                .eq('token', token);

            console.log(`[DailyToken] ✅ Token email sent to ${userEmail} (ID: ${data.id})`);
            return { success: true, emailId: data.id };

        } catch (error) {
            console.error('[DailyToken] Exception sending email:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send consolidated email to admin with all daily tokens for super_admin & moderator users
     * Modern fancy template with token table
     */
    async sendBulkAdminTokenEmail(adminEmail, tokenList) {
        try {
            if (!adminEmail || !adminEmail.includes('@')) {
                console.warn(`[DailyToken] Invalid admin email: ${adminEmail}`);
                return { success: false, error: 'Invalid email address' };
            }

            if (!this.emailsEnabled || !this.resend) {
                console.warn(`[DailyToken] ⚠️ Email sending is DISABLED`);
                console.log(`[DailyToken] 📧 Admin token email to ${adminEmail}:`);
                tokenList.forEach(t => {
                    console.log(`[DailyToken]   ${t.userName} (${t.role}): ${t.token}`);
                });
                return { success: true, emailId: 'dev-mode', debug: true };
            }

            // Build token table HTML
            let tokenTableHTML = '';
            tokenList.forEach((token, index) => {
                const roleLabel = token.role === 'super_admin' ? '👑 Super Admin' : '⚙️ Moderator';
                tokenTableHTML += `
                    <tr style="border-bottom: 1px solid #e0e0e0;">
                        <td style="padding: 12px; text-align: center; color: #667eea; font-weight: 600;">${index + 1}</td>
                        <td style="padding: 12px;"><strong>${token.userName}</strong><br><span style="font-size: 12px; color: #999;">${token.userEmail}</span></td>
                        <td style="padding: 12px; text-align: center; color: #666;">${roleLabel}</td>
                        <td style="padding: 12px; text-align: center; font-family: 'Courier New', monospace; font-size: 16px; font-weight: 700; letter-spacing: 2px; color: #667eea;">${token.token}</td>
                    </tr>
                `;
            });

            const subject = `🔑 Tokens Harian - ${tokenList.length} User(s) | Arsip Digital Anka`;

            const htmlContent = `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tokens Harian Admin</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 30px;
            text-align: center;
            color: white;
        }
        .header-logo {
            display: inline-block;
            width: 50px;
            height: 50px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 15px;
            font-size: 28px;
        }
        .header h1 {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 5px;
            letter-spacing: -0.5px;
        }
        .header p {
            font-size: 14px;
            opacity: 0.9;
        }
        .content {
            padding: 40px 30px;
        }
        .greeting {
            font-size: 16px;
            color: #333;
            margin-bottom: 10px;
            line-height: 1.5;
        }
        .greeting strong { color: #667eea; }
        .description {
            font-size: 14px;
            color: #666;
            line-height: 1.6;
            margin-bottom: 30px;
        }
        .tokens-section {
            margin: 30px 0;
            border-radius: 12px;
            overflow: hidden;
            border: 2px solid #667eea;
            background: #f8f9ff;
        }
        .tokens-section-title {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 20px;
            font-weight: 600;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .tokens-table {
            width: 100%;
            border-collapse: collapse;
            background: white;
        }
        .tokens-table thead {
            background: #f0f4ff;
            border-bottom: 2px solid #e0e0e0;
        }
        .tokens-table th {
            padding: 15px;
            text-align: left;
            font-weight: 600;
            color: #667eea;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .tokens-table td {
            padding: 12px 15px;
        }
        .info-box {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 4px;
        }
        .info-box .title {
            font-weight: 600;
            color: #667eea;
            margin-bottom: 8px;
            font-size: 14px;
        }
        .info-box ul {
            list-style: none;
            font-size: 13px;
            color: #555;
            line-height: 1.8;
        }
        .info-box li {
            margin-bottom: 5px;
            padding-left: 20px;
            position: relative;
        }
        .info-box li:before {
            content: "✓";
            position: absolute;
            left: 0;
            color: #667eea;
            font-weight: bold;
        }
        .footer {
            background: #f8f9fa;
            padding: 20px 30px;
            text-align: center;
            border-top: 1px solid #eee;
        }
        .footer p {
            font-size: 12px;
            color: #999;
            margin: 5px 0;
            line-height: 1.5;
        }
        .footer-logo {
            display: inline-block;
            font-weight: 700;
            color: #667eea;
            font-size: 14px;
            margin-top: 10px;
        }
        .summary-box {
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%);
            border: 2px solid #e0e0e0;
            border-radius: 12px;
            padding: 15px;
            margin-bottom: 20px;
            text-align: center;
        }
        .summary-box .count {
            font-size: 32px;
            font-weight: 700;
            color: #667eea;
            margin-bottom: 5px;
        }
        .summary-box .label {
            font-size: 13px;
            color: #666;
            font-weight: 500;
        }
        @media (max-width: 600px) {
            .header { padding: 30px 20px; }
            .header h1 { font-size: 24px; }
            .content { padding: 25px 20px; }
            .tokens-table th, .tokens-table td { padding: 8px; font-size: 12px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="header-logo">🔑</div>
            <h1>Tokens Harian Admin</h1>
            <p>Arsip Digital Anka - Laporan Akses Harian</p>
        </div>

        <!-- Content -->
        <div class="content">
            <!-- Greeting -->
            <div class="greeting">
                Halo <strong>Tim Admin</strong>,
            </div>
            
            <div class="description">
                Berikut adalah kode akses login harian untuk semua user dengan role <strong>Super Admin</strong> dan <strong>Moderator</strong>. Kode ini berlaku selama 24 jam.
            </div>

            <!-- Summary -->
            <div class="summary-box">
                <div class="count">${tokenList.length}</div>
                <div class="label">User dengan token baru</div>
            </div>

            <!-- Tokens Table -->
            <div class="tokens-section">
                <div class="tokens-section-title">📋 Daftar Token Harian</div>
                <table class="tokens-table">
                    <thead>
                        <tr>
                            <th style="width: 50px;">No</th>
                            <th>Pengguna</th>
                            <th>Role</th>
                            <th>Kode Token</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tokenTableHTML}
                    </tbody>
                </table>
            </div>

            <!-- Info -->
            <div class="info-box">
                <div class="title">ℹ️ Informasi Penting</div>
                <ul>
                    <li>Setiap kode berlaku selama 24 jam ke depan</li>
                    <li>Kode baru akan dikirim otomatis setiap hari jam 04:00</li>
                    <li>Sistem akan melakukan logout otomatis setiap hari jam 00:00</li>
                    <li>Email ini berisi informasi sensitif - jaga kerahasiaannya</li>
                </ul>
            </div>
        </div>

        <!-- Footer -->
        <div class="footer">
            <p>Email ini dikirim otomatis oleh sistem admin panel</p>
            <p>© ${new Date().getFullYear()} <span class="footer-logo">Arsip Digital Anka</span></p>
            <p style="margin-top: 8px; font-size: 11px;">Waktu pengiriman: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</p>
        </div>
    </div>
</body>
</html>
            `;

            const { data, error } = await this.resend.emails.send({
                from: this.fromEmail,
                to: adminEmail,
                subject,
                html: htmlContent
            });

            if (error) {
                console.error('[DailyToken] Resend error sending bulk admin email:', error);
                return { success: false, error: error.message };
            }

            console.log(`[DailyToken] ✅ Bulk admin token email sent to ${adminEmail} (ID: ${data.id})`);
            return { success: true, emailId: data.id };

        } catch (error) {
            console.error('[DailyToken] Exception sending bulk admin email:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Verify token with attempt tracking
     */
    async verifyToken(userId, token) {
        try {
            // Get current token record
            const { data: tokenRecord, error: fetchError } = await this.supabase
                .from('daily_login_tokens')
                .select('*')
                .eq('user_id', userId)
                .eq('token', token)
                .gt('expires_at', new Date().toISOString())
                .single();

            if (fetchError || !tokenRecord) {
                console.warn(`[DailyToken] Invalid/expired token for user ${userId}`);
                return {
                    success: false,
                    error: 'Token tidak valid atau sudah expired',
                    attempts: 0,
                    remainingAttempts: this.MAX_ATTEMPTS
                };
            }

            // Check if already used
            if (tokenRecord.is_used) {
                return {
                    success: false,
                    error: 'Token sudah digunakan',
                    attempts: tokenRecord.token_attempts,
                    remainingAttempts: Math.max(0, this.MAX_ATTEMPTS - tokenRecord.token_attempts)
                };
            }

            // Check if locked
            if (tokenRecord.is_locked) {
                const lockedUntil = new Date(tokenRecord.locked_until);
                const now = new Date();
                if (now < lockedUntil) {
                    const minutesLeft = Math.ceil((lockedUntil - now) / 60000);
                    return {
                        success: false,
                        error: `Terlalu banyak percobaan. Coba lagi dalam ${minutesLeft} menit`,
                        locked: true,
                        lockedUntil: tokenRecord.locked_until,
                        attempts: tokenRecord.token_attempts
                    };
                } else {
                    // Unlock if time has passed
                    await this.supabase
                        .from('daily_login_tokens')
                        .update({
                            is_locked: false,
                            locked_until: null,
                            token_attempts: 0
                        })
                        .eq('id', tokenRecord.id);
                }
            }

            // Token is valid - mark as used
            const { error: updateError } = await this.supabase
                .from('daily_login_tokens')
                .update({
                    is_used: true,
                    used_at: new Date().toISOString()
                })
                .eq('id', tokenRecord.id);

            if (updateError) {
                return { success: false, error: 'Failed to update token' };
            }

            console.log(`[DailyToken] ✅ Token verified for user ${userId}`);
            return { success: true, tokenId: tokenRecord.id };

        } catch (error) {
            console.error('[DailyToken] Exception verifying token:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Record failed attempt
     */
    async recordFailedAttempt(userId, token) {
        try {
            const { data: tokenRecord } = await this.supabase
                .from('daily_login_tokens')
                .select('*')
                .eq('user_id', userId)
                .eq('token', token)
                .single();

            if (!tokenRecord) return null;

            const newAttempts = tokenRecord.token_attempts + 1;
            const isLocked = newAttempts >= this.MAX_ATTEMPTS;
            const lockedUntil = isLocked ? new Date(Date.now() + this.LOCK_DURATION_MS) : null;

            const { error } = await this.supabase
                .from('daily_login_tokens')
                .update({
                    token_attempts: newAttempts,
                    last_attempt_at: new Date().toISOString(),
                    is_locked: isLocked,
                    locked_until: lockedUntil ? lockedUntil.toISOString() : null
                })
                .eq('id', tokenRecord.id);

            if (error) {
                console.error('[DailyToken] Error recording attempt:', error);
            }

            const remainingAttempts = Math.max(0, this.MAX_ATTEMPTS - newAttempts);
            return {
                attempts: newAttempts,
                remainingAttempts,
                isLocked,
                lockedUntil
            };

        } catch (error) {
            console.error('[DailyToken] Exception recording attempt:', error);
            return null;
        }
    }

    /**
     * Generate and send tokens for all users with valid emails
     * Role-based routing:
     * - super_admin & moderator → send to ADMIN_TOKEN_EMAIL (centralized)
     * - admin_zona & others → send to their individual email
     */
    async generateAndSendDailyTokens() {
        try {
            // Check if token auth is enabled
            const isEnabled = process.env.ENABLE_DAILY_TOKEN_AUTH === 'true';
            if (!isEnabled) {
                console.log('[DailyToken] ⏸️ Token generation DISABLED - ENABLE_DAILY_TOKEN_AUTH=false');
                console.log('[DailyToken] No tokens will be generated or sent until enabled');
                return {
                    success: true,
                    generated: 0,
                    sent: 0,
                    message: 'Token generation disabled'
                };
            }

            console.log('[DailyToken] Starting daily token generation at 04:00...');

            // Get all users from users table (not just auth.users)
            const { data: dbUsers, error: dbError } = await this.supabase
                .from('users')
                .select('id, email, name, role, is_active, contact_email')
                .eq('is_active', true);

            if (dbError) {
                console.error('[DailyToken] Error fetching users table:', dbError);
                return { success: false, error: dbError.message };
            }

            // Filter users with valid emails
            let users = (dbUsers || []).filter(u => {
                const emailToUse = u.contact_email || u.email;
                return emailToUse && emailToUse.includes('@');
            });

            if (users.length === 0) {
                console.log('[DailyToken] No active users with valid emails');
                return { success: true, generated: 0, sent: 0, totalUsers: 0 };
            }

            console.log(`[DailyToken] Found ${users.length} active users with valid emails`);
            console.log(`[DailyToken] Centralized admin email: ${this.adminTokenEmail || '(NOT SET)'}`);

            let generated = 0;
            let sent = 0;
            const results = [];
            const adminTokens = {}; // Collect tokens for super_admin & moderator

            for (const user of users) {
                try {
                    // Use contact_email if available, otherwise email
                    const userEmail = user.contact_email || user.email;

                    // Create token
                    const tokenResult = await this.createDailyToken(user.id, userEmail);
                    if (!tokenResult.success) {
                        results.push({
                            userId: user.id,
                            name: user.name,
                            email: userEmail,
                            role: user.role,
                            status: 'failed',
                            error: tokenResult.error
                        });
                        continue;
                    }

                    generated++;

                    // Determine user role and target email
                    const userRole = user.role || 'user';
                    const isAdmin = ['super_admin', 'moderator'].includes(userRole);
                    const targetEmail = isAdmin && this.adminTokenEmail ? this.adminTokenEmail : userEmail;

                    console.log(`[DailyToken] User ${user.id} (${user.name}) role: ${userRole}, isAdmin: ${isAdmin}, adminTokenEmail: ${this.adminTokenEmail}, targetEmail: ${targetEmail}`);

                    // For super_admin & moderator, collect tokens to send as single email
                    if (isAdmin && this.adminTokenEmail) {
                        console.log(`[DailyToken] ✅ Queuing ${user.email} token for centralized admin email`);
                        if (!adminTokens[targetEmail]) {
                            adminTokens[targetEmail] = [];
                        }
                        adminTokens[targetEmail].push({
                            userId: user.id,
                            userName: user.name || user.email.split('@')[0],
                            userEmail: userEmail,
                            token: tokenResult.token,
                            role: userRole
                        });
                        results.push({
                            userId: user.id,
                            name: user.name,
                            email: userEmail,
                            role: userRole,
                            status: 'queued_for_admin_email',
                            targetEmail
                        });
                    } else {
                        console.log(`[DailyToken] ℹ️ Sending ${user.email} token to individual email (not admin or no centralizedEmail)`);
                        // Send individual email for non-admin users
                        const emailResult = await this.sendTokenEmail(
                            user.id,
                            targetEmail,
                            tokenResult.token,
                            user.name || user.email.split('@')[0],
                            userRole
                        );

                        if (emailResult.success) {
                            sent++;
                            results.push({
                                userId: user.id,
                                name: user.name,
                                email: userEmail,
                                role: userRole,
                                status: 'sent',
                                token: tokenResult.token
                            });
                        } else {
                            results.push({
                                userId: user.id,
                                name: user.name,
                                email: userEmail,
                                role: userRole,
                                status: 'email_failed',
                                error: emailResult.error
                            });
                        }
                    }

                } catch (error) {
                    console.error(`[DailyToken] Error processing user ${user.id}:`, error);
                    results.push({
                        userId: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        status: 'error',
                        error: error.message
                    });
                }
            }

            // Send consolidated email for super_admin & moderator users
            for (const [adminEmail, tokens] of Object.entries(adminTokens)) {
                try {
                    const bulkEmailResult = await this.sendBulkAdminTokenEmail(adminEmail, tokens);
                    if (bulkEmailResult.success) {
                        sent++;
                        console.log(`[DailyToken] ✅ Admin consolidated email sent to ${adminEmail} with ${tokens.length} tokens`);
                    } else {
                        console.error(`[DailyToken] ❌ Failed to send admin email to ${adminEmail}:`, bulkEmailResult.error);
                    }
                } catch (error) {
                    console.error(`[DailyToken] Error sending admin email:`, error);
                }
            }

            console.log(`[DailyToken] ✅ Daily token generation complete: ${generated} generated, ${sent} sent`);
            return {
                success: true,
                generated,
                sent,
                total: users.length,
                results
            };

        } catch (error) {
            console.error('[DailyToken] Exception in daily token generation:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Cleanup expired tokens at 00:00
     */
    async cleanupExpiredTokens() {
        try {
            console.log('[DailyToken] Starting cleanup of expired tokens at 00:00...');

            const { data, error } = await this.supabase
                .from('daily_login_tokens')
                .delete()
                .lt('expires_at', new Date().toISOString());

            if (error) {
                console.error('[DailyToken] Error cleaning up tokens:', error);
                return { success: false, error: error.message };
            }

            console.log(`[DailyToken] ✅ Cleanup complete: expired tokens removed`);
            return { success: true };

        } catch (error) {
            console.error('[DailyToken] Exception during cleanup:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get token statistics (for admin dashboard)
     */
    async getTokenStats() {
        try {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            // Count stats
            const { data: totalToday } = await this.supabase
                .from('daily_login_tokens')
                .select('id', { count: 'exact' })
                .gte('created_at', today.toISOString());

            const { data: usedToday } = await this.supabase
                .from('daily_login_tokens')
                .select('id', { count: 'exact' })
                .gte('created_at', today.toISOString())
                .eq('is_used', true);

            const { data: emailFailed } = await this.supabase
                .from('daily_login_tokens')
                .select('id', { count: 'exact' })
                .gte('created_at', today.toISOString())
                .eq('email_sent', false);

            return {
                success: true,
                stats: {
                    totalGenerated: totalToday[0]?.count || 0,
                    totalUsed: usedToday[0]?.count || 0,
                    emailFailed: emailFailed[0]?.count || 0,
                    lastUpdated: new Date().toISOString()
                }
            };

        } catch (error) {
            console.error('[DailyToken] Exception getting stats:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = DailyTokenService;
