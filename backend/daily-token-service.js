/**
 * Daily Token Service
 * Handles generation, validation, and email delivery of daily 5-digit tokens
 */

const { Resend } = require('resend');

class DailyTokenService {
    constructor(supabaseClient, resendApiKey, fromEmail) {
        this.supabase = supabaseClient;
        
        // Check if API key is valid (not placeholder)
        const isValidKey = resendApiKey && 
                          resendApiKey.startsWith('re_') && 
                          resendApiKey.length > 20;
        
        if (isValidKey) {
            this.resend = new Resend(resendApiKey);
            this.emailsEnabled = true;
            console.log('[DailyToken] ✅ Resend email service initialized');
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
     * Send token via email using Resend
     */
    async sendTokenEmail(userId, userEmail, token, userName = 'User') {
        try {
            if (!userEmail || !userEmail.includes('@')) {
                console.warn(`[DailyToken] Invalid email for user ${userId}: ${userEmail}`);
                return { success: false, error: 'Invalid email address' };
            }

            // Check if emails are disabled
            if (this.emailsDisabled || !this.resend) {
                console.warn(`[DailyToken] ⚠️ Email sending is DISABLED - Resend API key not configured`);
                console.log(`[DailyToken] Token for ${userEmail}: ${token} (would be sent via email in production)`);
                return { success: false, error: 'Email service not configured. Check RESEND_API_KEY in environment variables.' };
            }

            const subject = 'Kode Akses Login Harian Arsip Digital Anka';
            const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .header h2 { color: #333; margin: 0 0 10px 0; }
        .content { color: #666; line-height: 1.6; }
        .token-box { 
            background-color: #f0f4ff; 
            border-left: 4px solid #4CAF50; 
            padding: 20px; 
            margin: 20px 0; 
            text-align: center;
            border-radius: 4px;
        }
        .token-display { 
            font-size: 32px; 
            font-weight: bold; 
            color: #4CAF50; 
            letter-spacing: 5px;
            font-family: 'Courier New', monospace;
            margin: 10px 0;
        }
        .warning { 
            background-color: #fff3cd; 
            border-left: 4px solid #ff9800; 
            padding: 15px; 
            margin: 20px 0;
            color: #856404;
            border-radius: 4px;
        }
        .footer { 
            margin-top: 30px; 
            padding-top: 20px; 
            border-top: 1px solid #eee; 
            font-size: 12px; 
            color: #999;
            text-align: center;
        }
        .button { 
            display: inline-block; 
            background-color: #4CAF50; 
            color: white; 
            padding: 10px 20px; 
            text-decoration: none; 
            border-radius: 4px;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>🔐 Kode Akses Login Harian</h2>
            <p style="color: #999; margin: 5px 0;">Arsip Digital Anka</p>
        </div>
        
        <div class="content">
            <p>Halo <strong>${userName}</strong>,</p>
            <p>Berikut adalah kode akses login harian Anda untuk sistem Arsip Digital Anka:</p>
            
            <div class="token-box">
                <p style="margin: 0 0 10px 0; color: #666; font-size: 14px;">Kode Akses (5 Digit)</p>
                <div class="token-display">${token}</div>
                <p style="margin: 10px 0 0 0; color: #666; font-size: 13px;">Berlaku 24 jam</p>
            </div>

            <div class="warning">
                <strong>⚠️ Penting:</strong>
                <ul style="margin: 10px 0; padding-left: 20px;">
                    <li>Kode ini hanya berlaku selama 24 jam</li>
                    <li>Jangan berikan kode ini kepada siapapun</li>
                    <li>Kode baru akan dikirim setiap hari jam 04:00</li>
                    <li>Jika Anda tidak meminta kode ini, abaikan email ini</li>
                </ul>
            </div>

            <p style="color: #666; font-size: 14px; margin-top: 20px;">
                Jika Anda mengalami kesulitan, hubungi tim support kami.
            </p>
        </div>

        <div class="footer">
            <p>© ${new Date().getFullYear()} Arsip Digital Anka. Semua hak dilindungi.</p>
            <p>Email ini dikirim otomatis dan tidak perlu dibalas.</p>
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
     * Called daily at 04:00
     */
    async generateAndSendDailyTokens() {
        try {
            console.log('[DailyToken] Starting daily token generation at 04:00...');

            // Get all users with valid emails
            const { data: users, error: fetchError } = await this.supabase
                .from('users')
                .select('id, email, username')
                .not('email', 'is', null)
                .neq('email', '')
                .gt('email', '@'); // Simple validation

            if (fetchError) {
                console.error('[DailyToken] Error fetching users:', fetchError);
                return { success: false, error: fetchError.message };
            }

            if (!users || users.length === 0) {
                console.log('[DailyToken] No users with valid emails');
                return { success: true, generated: 0, sent: 0 };
            }

            let generated = 0;
            let sent = 0;
            const results = [];

            for (const user of users) {
                try {
                    // Create token
                    const tokenResult = await this.createDailyToken(user.id, user.email);
                    if (!tokenResult.success) {
                        results.push({
                            userId: user.id,
                            email: user.email,
                            status: 'failed',
                            error: tokenResult.error
                        });
                        continue;
                    }

                    generated++;

                    // Send email
                    const emailResult = await this.sendTokenEmail(
                        user.id,
                        user.email,
                        tokenResult.token,
                        user.username
                    );

                    if (emailResult.success) {
                        sent++;
                        results.push({
                            userId: user.id,
                            email: user.email,
                            status: 'sent',
                            token: tokenResult.token
                        });
                    } else {
                        results.push({
                            userId: user.id,
                            email: user.email,
                            status: 'email_failed',
                            error: emailResult.error
                        });
                    }

                } catch (error) {
                    console.error(`[DailyToken] Error processing user ${user.id}:`, error);
                    results.push({
                        userId: user.id,
                        email: user.email,
                        status: 'error',
                        error: error.message
                    });
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
