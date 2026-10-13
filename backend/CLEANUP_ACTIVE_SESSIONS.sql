-- Cleanup old and invalid sessions from active_sessions table
-- Run this to remove stale sessions that weren't properly invalidated on logout

-- View all sessions (for inspection)
SELECT 
    id,
    user_id,
    session_id,
    is_valid,
    created_at,
    last_activity,
    NOW() - last_activity as inactive_duration
FROM active_sessions
ORDER BY last_activity DESC;

-- Mark sessions as invalid if they haven't had activity in X hours (e.g., 24 hours)
-- This helps clean up orphaned sessions from users who lost connection
UPDATE active_sessions
SET is_valid = false
WHERE is_valid = true 
AND last_activity < NOW() - INTERVAL '24 hours';

-- Delete all invalid sessions older than 7 days
DELETE FROM active_sessions
WHERE is_valid = false
AND created_at < NOW() - INTERVAL '7 days';

-- Count active vs inactive sessions
SELECT 
    is_valid,
    COUNT(*) as count,
    COUNT(CASE WHEN last_activity > NOW() - INTERVAL '1 hour' THEN 1 END) as active_in_last_hour
FROM active_sessions
GROUP BY is_valid;
