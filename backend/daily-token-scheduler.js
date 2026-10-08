/**
 * Daily Token Scheduler
 * Handles scheduled tasks:
 * - 04:00 every day: Generate and send daily tokens to all users
 * - 00:00 every day: Cleanup expired tokens and auto-logout all sessions
 */

const cron = require('node-cron');
const jwt = require('jsonwebtoken');

class DailyTokenScheduler {
    constructor(supabase, dailyTokenService) {
        this.supabase = supabase;
        this.dailyTokenService = dailyTokenService;
        this.jobs = [];
    }

    /**
     * Start all scheduled jobs
     */
    start() {
        console.log('[Scheduler] Starting daily token scheduler...');
        
        this.scheduleTokenGeneration();
        this.scheduleTokenCleanup();
        
        console.log('[Scheduler] ✅ All scheduled jobs started');
    }

    /**
     * Schedule token generation at 04:00 every day
     * Format: 0 4 * * * (minute 0, hour 4, every day)
     */
    scheduleTokenGeneration() {
        try {
            const job = cron.schedule('0 4 * * *', async () => {
                console.log('[Scheduler] 🔔 Executing token generation at 04:00');
                
                try {
                    const result = await this.dailyTokenService.generateAndSendDailyTokens();
                    
                    if (result.success) {
                        console.log(`[Scheduler] ✅ Token generation complete: ${result.generated} generated, ${result.sent} sent`);
                    } else {
                        console.error('[Scheduler] ❌ Token generation failed:', result.error);
                    }
                } catch (error) {
                    console.error('[Scheduler] ❌ Error during token generation:', error);
                }
            });

            this.jobs.push(job);
            console.log('[Scheduler] ✅ Token generation job scheduled (04:00 daily)');

        } catch (error) {
            console.error('[Scheduler] Error scheduling token generation:', error);
        }
    }

    /**
     * Schedule cleanup and auto-logout at 00:00 every day
     * Format: 0 0 * * * (minute 0, hour 0, every day)
     */
    scheduleTokenCleanup() {
        try {
            const job = cron.schedule('0 0 * * *', async () => {
                console.log('[Scheduler] 🔔 Executing cleanup and auto-logout at 00:00');
                
                try {
                    // Step 1: Cleanup expired tokens
                    const cleanupResult = await this.dailyTokenService.cleanupExpiredTokens();
                    
                    if (cleanupResult.success) {
                        console.log('[Scheduler] ✅ Expired tokens cleaned up');
                    } else {
                        console.error('[Scheduler] ❌ Cleanup failed:', cleanupResult.error);
                    }

                    // Step 2: Invalidate all sessions (clear JWT tokens in database)
                    // This doesn't actually invalidate JWTs (they're stateless) but we can
                    // record it and check against a blacklist on future requests
                    const logoutResult = await this.invalidateAllSessions();
                    
                    if (logoutResult.success) {
                        console.log('[Scheduler] ✅ All sessions invalidated (auto-logout)');
                    } else {
                        console.error('[Scheduler] ❌ Session invalidation failed:', logoutResult.error);
                    }

                } catch (error) {
                    console.error('[Scheduler] ❌ Error during cleanup:', error);
                }
            });

            this.jobs.push(job);
            console.log('[Scheduler] ✅ Cleanup and auto-logout job scheduled (00:00 daily)');

        } catch (error) {
            console.error('[Scheduler] Error scheduling cleanup:', error);
        }
    }

    /**
     * Invalidate all active sessions at 00:00
     * Add all current JWTs to a blacklist or mark sessions as invalid
     */
    async invalidateAllSessions() {
        try {
            // Create a record in a session_invalidation table
            // This allows us to check if a JWT was issued before or after the invalidation
            const invalidationTime = new Date().toISOString();

            // Insert invalidation record
            const { error } = await this.supabase
                .from('session_invalidations')
                .insert({
                    invalidated_at: invalidationTime,
                    reason: 'Daily auto-logout at 00:00'
                });

            if (error) {
                console.error('[Scheduler] Error creating invalidation record:', error);
                return { success: false, error: error.message };
            }

            console.log('[Scheduler] Session invalidation record created at:', invalidationTime);
            return { success: true, invalidationTime };

        } catch (error) {
            console.error('[Scheduler] Exception in invalidateAllSessions:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Stop all scheduled jobs (for testing or graceful shutdown)
     */
    stop() {
        this.jobs.forEach(job => {
            job.stop();
        });
        console.log('[Scheduler] ⏹️ All scheduled jobs stopped');
    }

    /**
     * Test token generation immediately (for development)
     */
    async testTokenGeneration() {
        console.log('[Scheduler] Testing token generation...');
        const result = await this.dailyTokenService.generateAndSendDailyTokens();
        console.log('[Scheduler] Test result:', result);
        return result;
    }

    /**
     * Test cleanup immediately (for development)
     */
    async testCleanup() {
        console.log('[Scheduler] Testing cleanup...');
        const result = await this.dailyTokenService.cleanupExpiredTokens();
        console.log('[Scheduler] Test result:', result);
        return result;
    }
}

module.exports = DailyTokenScheduler;
