/**
 * Daily Token Admin Management Endpoints
 * Token management page and admin functions
 */

module.exports = function registerDailyTokenAdminEndpoints(app, supabase, authenticateToken, authorizeRole, dailyTokenService) {

    /**
     * GET /api/auth/daily-tokens
     * Get all daily tokens (admin only)
     */
    app.get('/api/auth/daily-tokens', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
        try {
            const { limit = 100, offset = 0, userId } = req.query;

            let query = supabase
                .from('daily_login_tokens')
                .select(`
                    id,
                    user_id,
                    token,
                    created_at,
                    expires_at,
                    token_attempts,
                    is_locked,
                    locked_until,
                    is_used,
                    email_sent,
                    email_address
                `)
                .order('created_at', { ascending: false });

            if (userId) {
                query = query.eq('user_id', userId);
            }

            // Apply limit and offset separately
            query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

            const { data: tokens, error } = await query;

            if (error) {
                console.error('[TokenAdmin] Error fetching tokens:', error);
                return res.status(500).json({
                    success: false,
                    error: error.message
                });
            }

            // Get user emails separately if needed
            let userMap = {};
            if (tokens && tokens.length > 0) {
                const uniqueUserIds = [...new Set(tokens.map(t => t.user_id))];
                const { data: users } = await supabase
                    .from('users')
                    .select('id, email, name')
                    .in('id', uniqueUserIds);
                
                if (users) {
                    users.forEach(u => {
                        userMap[u.id] = u;
                    });
                }
            }

            // Format response
            const formattedTokens = tokens.map(token => ({
                id: token.id,
                userId: token.user_id,
                username: userMap[token.user_id]?.name || 'Unknown',
                email: token.email_address || userMap[token.user_id]?.email || 'N/A',
                token: token.token,
                createdAt: token.created_at,
                expiresAt: token.expires_at,
                tokenAttempts: token.token_attempts,
                isLocked: token.is_locked,
                lockedUntil: token.locked_until,
                isUsed: token.is_used,
                emailSent: token.email_sent
            }));

            console.log(`[TokenAdmin] Fetched ${formattedTokens.length} tokens`);

            res.json({
                success: true,
                tokens: formattedTokens,
                count: formattedTokens.length
            });

        } catch (error) {
            console.error('[TokenAdmin] Exception fetching tokens:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch tokens: ' + error.message
            });
        }
    });

    /**
     * POST /api/auth/generate-tokens-now
     * Manually trigger token generation and sending (admin only)
     */
    app.post('/api/auth/generate-tokens-now', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
        try {
            console.log('[TokenAdmin] Manual token generation triggered');

            const result = await dailyTokenService.generateAndSendDailyTokens();

            if (result.success) {
                console.log(`[TokenAdmin] ✅ Manual generation completed: ${result.generated} generated, ${result.sent} sent`);
                res.json({
                    success: true,
                    message: 'Token generation completed',
                    generated: result.generated,
                    sent: result.sent,
                    total: result.total,
                    results: result.results
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.error
                });
            }

        } catch (error) {
            console.error('[TokenAdmin] Manual generation error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to generate tokens'
            });
        }
    });

    /**
     * POST /api/auth/cleanup-expired-now
     * Manually trigger cleanup of expired tokens (admin only)
     */
    app.post('/api/auth/cleanup-expired-now', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
        try {
            console.log('[TokenAdmin] Manual cleanup triggered');

            const result = await dailyTokenService.cleanupExpiredTokens();

            if (result.success) {
                console.log(`[TokenAdmin] ✅ Manual cleanup completed`);
                res.json({
                    success: true,
                    message: 'Expired tokens cleaned up'
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.error
                });
            }

        } catch (error) {
            console.error('[TokenAdmin] Manual cleanup error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to cleanup tokens'
            });
        }
    });

    /**
     * POST /api/auth/resend-token-manual
     * Resend token to user (admin only)
     * IMPORTANT: Routes admin/moderator tokens to centralized email, others to individual
     */
    app.post('/api/auth/resend-token-manual', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
        try {
            const { tokenId } = req.body;

            if (!tokenId) {
                return res.status(400).json({
                    success: false,
                    error: 'Token ID required'
                });
            }

            // Get token
            const { data: tokenRecord, error: fetchError } = await supabase
                .from('daily_login_tokens')
                .select('*')
                .eq('id', tokenId)
                .single();

            if (fetchError || !tokenRecord) {
                return res.status(404).json({
                    success: false,
                    error: 'Token not found'
                });
            }

            // Get user info
            const { data: user } = await supabase
                .from('users')
                .select('name, email, role')
                .eq('id', tokenRecord.user_id)
                .single();

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            // Determine if user is admin and should use centralized email
            const isAdmin = ['super_admin', 'moderator'].includes(user.role);
            const targetEmail = isAdmin && process.env.ADMIN_TOKEN_EMAIL 
                ? process.env.ADMIN_TOKEN_EMAIL 
                : (tokenRecord.email_address || user.email);

            console.log(`[TokenAdmin] Resending token for ${user.name} (${user.role}) to ${targetEmail}`);

            // Resend email to appropriate address
            const emailResult = await dailyTokenService.sendTokenEmail(
                tokenRecord.user_id,
                targetEmail,
                tokenRecord.token,
                user.name || 'User',
                user.role
            );

            if (emailResult.success) {
                console.log(`[TokenAdmin] ✅ Token resent to ${targetEmail}`);
                res.json({
                    success: true,
                    message: 'Token resent successfully',
                    sentTo: targetEmail
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: 'Failed to resend token: ' + emailResult.error
                });
            }

        } catch (error) {
            console.error('[TokenAdmin] Resend token error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to resend token'
            });
        }
    });

    /**
     * DELETE /api/auth/delete-token/:id
     * Delete a token record (admin only)
     */
    app.delete('/api/auth/delete-token/:id', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
        try {
            const { id } = req.params;

            const { error } = await supabase
                .from('daily_login_tokens')
                .delete()
                .eq('id', parseInt(id));

            if (error) {
                console.error('[TokenAdmin] Delete error:', error);
                return res.status(500).json({
                    success: false,
                    error: error.message
                });
            }

            console.log(`[TokenAdmin] ✅ Token ${id} deleted`);
            res.json({
                success: true,
                message: 'Token deleted successfully'
            });

        } catch (error) {
            console.error('[TokenAdmin] Delete exception:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete token'
            });
        }
    });

    /**
     * POST /api/auth/reset-attempts/:userId
     * Reset token attempts for a user (admin only)
     */
    app.post('/api/auth/reset-attempts/:userId', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
        try {
            const { userId } = req.params;

            const { error } = await supabase
                .from('daily_login_tokens')
                .update({
                    token_attempts: 0,
                    is_locked: false,
                    locked_until: null
                })
                .eq('user_id', parseInt(userId));

            if (error) {
                console.error('[TokenAdmin] Reset attempts error:', error);
                return res.status(500).json({
                    success: false,
                    error: error.message
                });
            }

            console.log(`[TokenAdmin] ✅ Attempts reset for user ${userId}`);
            res.json({
                success: true,
                message: 'Attempts reset successfully'
            });

        } catch (error) {
            console.error('[TokenAdmin] Reset attempts exception:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to reset attempts'
            });
        }
    });

};
