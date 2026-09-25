/**
 * Scheduled Auto-Logout Job
 * 
 * This job runs at the configured AUTO_LOGOUT_TIME and invalidates all active sessions,
 * forcing all users to logout from the system automatically.
 */

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const autoLogoutTime = process.env.AUTO_LOGOUT_TIME || '18:00';

if (!supabaseUrl || !supabaseKey) {
    console.error('[SCHEDULED_LOGOUT] Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Parse time string (HH:MM) and return object with hours and minutes
 */
function parseTimeString(timeStr) {
    const [hour, minute] = timeStr.split(':').map(Number);
    if (isNaN(hour) || isNaN(minute)) {
        throw new Error(`Invalid time format: ${timeStr}. Expected HH:MM`);
    }
    return { hour, minute };
}

/**
 * Calculate milliseconds until next auto-logout time
 */
function getMillisecondsUntilLogout() {
    try {
        const { hour, minute } = parseTimeString(autoLogoutTime);
        const now = new Date();
        let logoutDate = new Date(now);
        
        logoutDate.setHours(hour, minute, 0, 0);
        
        // If the time has already passed today, schedule for tomorrow
        if (logoutDate <= now) {
            logoutDate.setDate(logoutDate.getDate() + 1);
        }
        
        const msUntilLogout = logoutDate.getTime() - now.getTime();
        return msUntilLogout;
    } catch (err) {
        console.error('[SCHEDULED_LOGOUT] Error parsing time:', err.message);
        return 24 * 60 * 60 * 1000; // Default to 24 hours
    }
}

/**
 * Get next scheduled logout time for display
 */
function getNextLogoutTime() {
    const now = new Date();
    const { hour, minute } = parseTimeString(autoLogoutTime);
    let logoutDate = new Date(now);
    
    logoutDate.setHours(hour, minute, 0, 0);
    
    if (logoutDate <= now) {
        logoutDate.setDate(logoutDate.getDate() + 1);
    }
    
    return logoutDate;
}

/**
 * Execute force logout for all active sessions
 */
async function executeAutoLogout() {
    console.log(`\n[SCHEDULED_LOGOUT] Executing auto-logout at ${new Date().toISOString()}`);
    
    try {
        // 1. Get count of active sessions before logout
        const { data: activeSessions, error: selectError } = await supabase
            .from('user_sessions')
            .select('id, user_id', { count: 'exact' })
            .eq('is_active', true);

        if (selectError) throw selectError;

        const sessionCount = activeSessions?.length || 0;
        console.log(`[SCHEDULED_LOGOUT] Found ${sessionCount} active sessions to invalidate`);

        // 2. Invalidate all active sessions
        const { error: updateError } = await supabase
            .from('user_sessions')
            .update({ 
                is_active: false, 
                revoked_at: new Date().toISOString(),
                invalidated_reason: 'Automatic daily logout'
            })
            .eq('is_active', true);

        if (updateError) throw updateError;

        // 3. Log this action
        await supabase.from('audit_logs').insert({
            user_id: null,
            action: 'Automatic Daily Logout',
            context: JSON.stringify({
                sessionsInvalidated: sessionCount,
                timestamp: new Date().toISOString(),
                logoutTime: autoLogoutTime
            })
        });

        console.log(`[SCHEDULED_LOGOUT] Successfully invalidated ${sessionCount} sessions`);
        console.log(`[SCHEDULED_LOGOUT] Next auto-logout scheduled for: ${getNextLogoutTime().toISOString()}`);

    } catch (err) {
        console.error('[SCHEDULED_LOGOUT] Error during auto-logout:', err);
        
        // Still log the failed attempt
        try {
            await supabase.from('audit_logs').insert({
                user_id: null,
                action: 'Automatic Daily Logout - Failed',
                context: JSON.stringify({
                    error: err.message,
                    timestamp: new Date().toISOString()
                })
            });
        } catch (logErr) {
            console.error('[SCHEDULED_LOGOUT] Failed to log error:', logErr);
        }
    }
}

/**
 * Schedule the next auto-logout job
 */
function scheduleNextLogout() {
    const msUntilLogout = getMillisecondsUntilLogout();
    const nextLogout = getNextLogoutTime();
    
    console.log(`[SCHEDULED_LOGOUT] Scheduled for: ${nextLogout.toISOString()} (${autoLogoutTime})`);
    console.log(`[SCHEDULED_LOGOUT] Time until next logout: ${Math.round(msUntilLogout / 1000 / 60)} minutes`);
    
    setTimeout(() => {
        executeAutoLogout().then(() => {
            // Schedule the next logout after this one completes
            scheduleNextLogout();
        });
    }, msUntilLogout);
}

/**
 * Initialize and start the scheduled job
 */
function initializeAutoLogoutScheduler() {
    console.log('='.repeat(70));
    console.log('[SCHEDULED_LOGOUT] Auto-Logout Scheduler Initialized');
    console.log('='.repeat(70));
    console.log(`[SCHEDULED_LOGOUT] Configuration: AUTO_LOGOUT_TIME = ${autoLogoutTime}`);
    console.log(`[SCHEDULED_LOGOUT] Database: ${supabaseUrl.substring(0, 30)}...`);
    
    scheduleNextLogout();
}

module.exports = {
    initializeAutoLogoutScheduler,
    executeAutoLogout,
    getMillisecondsUntilLogout,
    getNextLogoutTime,
    parseTimeString
};

// If run directly, start the scheduler
if (require.main === module) {
    require('dotenv').config({ path: require('path').join(__dirname, '.env') });
    initializeAutoLogoutScheduler();
}
