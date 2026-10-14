-- Cleanup sessions with NULL user_role
-- These are old sessions before the fix was applied

-- View sessions that need cleanup
SELECT id, user_id, session_id, user_role, is_valid, created_at 
FROM active_sessions 
WHERE user_role IS NULL
ORDER BY created_at DESC;

-- Delete old sessions without user_role
DELETE FROM active_sessions 
WHERE user_role IS NULL;

-- Verify cleanup
SELECT 
    COUNT(*) as total_sessions, 
    COUNT(CASE WHEN user_role IS NULL THEN 1 END) as null_roles,
    COUNT(CASE WHEN is_valid = true THEN 1 END) as valid_sessions
FROM active_sessions;

-- Show current active sessions by role
SELECT user_role, COUNT(*) as count
FROM active_sessions
WHERE is_valid = true
GROUP BY user_role;
