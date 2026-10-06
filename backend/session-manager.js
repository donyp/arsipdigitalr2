/**
 * Session Manager - Concurrent Session Limit
 * Max 2 active sessions per user
 */

const crypto = require('crypto');

const SESSION_DURATION_HOURS = 24;

// Role-based session limits
const SESSION_LIMITS = {
    super_admin: 1,      // Super admin: max 1 session
    moderator: 1,        // Moderator: max 1 session
    admin_zona: 2,       // Admin zona: max 2 sessions
    operator: 2,         // Operator: max 2 sessions
    viewer: 2            // Viewer: max 2 sessions
};

const DEFAULT_LIMIT = 2; // Default for unknown roles

class SessionManager {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
    }

    /**
     * Generate unique session token
     */
    generateSessionToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Check if user can create new session (role-based limits)
     * For users with limit=1 (super_admin, moderator), auto-terminate old sessions
     * Returns { allowed: boolean, reason?: string, activeCount?: number, maxAllowed?: number }
     */
    async canCreateSession(userId, userRole) {
        try {
            // Get max sessions allowed for this role
            const maxSessions = SESSION_LIMITS[userRole] || DEFAULT_LIMIT;
            
            // Call Postgres function to count active sessions (auto-cleanup expired)
            const { data, error } = await this.supabase.rpc('count_active_sessions', {
                p_user_id: userId
            });

            if (error) {
                console.error('[SessionManager] Error checking sessions:', error);
                // On error, allow login (fail open)
                return { allowed: true };
            }

            const activeCount = data || 0;
            console.log(`[SessionManager] User ${userId} (${userRole}) has ${activeCount}/${maxSessions} active sessions`);

            // AUTO-TERMINATE old sessions if user has limit=1 (moderator, super_admin)
            if (maxSessions === 1 && activeCount > 0) {
                console.log(`[SessionManager] Auto-terminating old sessions for ${userRole} (limit=1)`);
                try {
                    const { error: terminateError } = await this.supabase
                        .from('user_sessions')
                        .update({ is_active: false })
                        .eq('user_id', userId)
                        .eq('is_active', true);
                    
                    if (!terminateError) {
                        console.log(`[SessionManager] ✅ Auto-terminated all old sessions for user ${userId}`);
                    }
                } catch (err) {
                    console.warn(`[SessionManager] Warning: Could not terminate old sessions:`, err.message);
                    // Continue anyway
                }
            }

            if (activeCount >= maxSessions) {
                // Check again after termination
                const { data: newCount } = await this.supabase.rpc('count_active_sessions', {
                    p_user_id: userId
                });
                
                const finalCount = newCount || 0;
                
                if (finalCount >= maxSessions) {
                    const reason = maxSessions === 1 
                        ? `Anda hanya boleh login dari 1 perangat sekaligus. Silakan logout dari perangat lain terlebih dahulu.`
                        : `Maksimal ${maxSessions} sesi login bersamaan. Anda sudah memiliki ${finalCount} sesi aktif. Silakan logout dari perangat lain terlebih dahulu.`;
                    
                    return {
                        allowed: false,
                        reason,
                        activeCount: finalCount,
                        maxAllowed: maxSessions
                    };
                }
            }

            return { allowed: true, activeCount, maxAllowed: maxSessions };
        } catch (err) {
            console.error('[SessionManager] Exception checking sessions:', err);
            return { allowed: true }; // Fail open
        }
    }

    /**
     * Create new session
     */
    async createSession(userId, userAgent = null, ipAddress = null) {
        try {
            const sessionToken = this.generateSessionToken();
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + SESSION_DURATION_HOURS);

            const { data, error } = await this.supabase
                .from('user_sessions')
                .insert({
                    user_id: userId,
                    session_token: sessionToken,
                    user_agent: userAgent,
                    ip_address: ipAddress,
                    expires_at: expiresAt.toISOString(),
                    is_active: true
                })
                .select()
                .single();

            if (error) {
                console.error('[SessionManager] Error creating session:', error);
                return { success: false, error: error.message };
            }

            console.log(`[SessionManager] ✅ Created session for user ${userId}: ${sessionToken.substring(0, 8)}...`);

            return {
                success: true,
                sessionToken,
                sessionId: data.id,
                expiresAt: data.expires_at
            };
        } catch (err) {
            console.error('[SessionManager] Exception creating session:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Update session activity (heartbeat)
     */
    async updateSessionActivity(sessionToken) {
        try {
            const { error } = await this.supabase
                .from('user_sessions')
                .update({
                    last_activity: new Date().toISOString()
                })
                .eq('session_token', sessionToken)
                .eq('is_active', true);

            if (error) {
                console.error('[SessionManager] Error updating session activity:', error);
            }
        } catch (err) {
            console.error('[SessionManager] Exception updating session:', err);
        }
    }

    /**
     * Terminate session (logout)
     */
    async terminateSession(sessionToken) {
        try {
            const { error } = await this.supabase
                .from('user_sessions')
                .update({ is_active: false })
                .eq('session_token', sessionToken);

            if (error) {
                console.error('[SessionManager] Error terminating session:', error);
                return { success: false };
            }

            console.log(`[SessionManager] ✅ Terminated session: ${sessionToken.substring(0, 8)}...`);
            return { success: true };
        } catch (err) {
            console.error('[SessionManager] Exception terminating session:', err);
            return { success: false };
        }
    }

    /**
     * Get user's active sessions (for admin view)
     */
    async getUserActiveSessions(userId) {
        try {
            const { data, error } = await this.supabase.rpc('get_user_active_sessions', {
                p_user_id: userId
            });

            if (error) {
                console.error('[SessionManager] Error getting sessions:', error);
                return { success: false, sessions: [] };
            }

            return { success: true, sessions: data || [] };
        } catch (err) {
            console.error('[SessionManager] Exception getting sessions:', err);
            return { success: false, sessions: [] };
        }
    }

    /**
     * Force logout all sessions for a user (admin action)
     */
    async forceLogoutUser(userId) {
        try {
            const { error } = await this.supabase
                .from('user_sessions')
                .update({ is_active: false })
                .eq('user_id', userId)
                .eq('is_active', true);

            if (error) {
                console.error('[SessionManager] Error force logout:', error);
                return { success: false };
            }

            console.log(`[SessionManager] ✅ Force logged out all sessions for user ${userId}`);
            return { success: true };
        } catch (err) {
            console.error('[SessionManager] Exception force logout:', err);
            return { success: false };
        }
    }

    /**
     * Verify session is still valid
     */
    async verifySession(sessionToken) {
        try {
            const { data, error } = await this.supabase
                .from('user_sessions')
                .select('user_id, expires_at, is_active')
                .eq('session_token', sessionToken)
                .single();

            if (error || !data) {
                return { valid: false };
            }

            const now = new Date();
            const expiresAt = new Date(data.expires_at);

            if (!data.is_active || expiresAt < now) {
                return { valid: false };
            }

            // Update activity
            await this.updateSessionActivity(sessionToken);

            return { valid: true, userId: data.user_id };
        } catch (err) {
            console.error('[SessionManager] Exception verifying session:', err);
            return { valid: false };
        }
    }
}

module.exports = SessionManager;
