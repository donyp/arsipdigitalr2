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
                    email_address,
                    users:user_id(id, username, email)
                `)
                .order('created_at', { ascending: false })
                .limit(parseInt(limit))
                .offset(parseInt(offset));

            if (userId) {
                query = query.eq('user_id', parseInt(userId));
            }

            const { data: tokens, error } = await query;

            if (error) {
                console.error('[TokenAdmin] Error fetching tokens:', error);
                return res.status(500).json({
                    success: false,
                    error: error.message
                });
            }

            // Format response
            const formattedTokens = tokens.map(token => ({
                id: token.id,
                userId: token.user_id,
                username: token.users?.username || 'Unknown',
                email: token.email_address || token.users?.email || 'N/A',
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
                error: 'Failed to fetch tokens'
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
                .select('*, users:user_id(username, email)')
                .eq('id', tokenId)
                .single();

            if (fetchError || !tokenRecord) {
                return res.status(404).json({
                    success: false,
                    error: 'Token not found'
                });
            }

            // Resend email
            const emailResult = await dailyTokenService.sendTokenEmail(
                tokenRecord.user_id,
                tokenRecord.email_address,
                tokenRecord.token,
                tokenRecord.users?.username
            );

            if (emailResult.success) {
                console.log(`[TokenAdmin] ✅ Token resent to ${tokenRecord.email_address}`);
                res.json({
                    success: true,
                    message: 'Token resent successfully'
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
