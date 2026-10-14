-- Cleanup sessions with NULL user_role
-- These are old sessions before the fix was applied

-- IMPORTANT: First ensure all required columns exist
ALTER TABLE IF EXISTS active_sessions
ADD COLUMN IF NOT EXISTS user_role VARCHAR(50),
ADD COLUMN IF NOT EXISTS username VARCHAR(255),
ADD COLUMN IF NOT EXISTS session_id VARCHAR(255);

-- View sessions that need cleanup (if user_role column exists and is NULL)
SELECT id, user_id, COALESCE(session_id, 'N/A') as session_id, COALESCE(user_role, 'NULL') as user_role, is_valid, created_at 
FROM active_sessions 
WHERE user_role IS NULL
ORDER BY created_at DESC;

-- Count sessions by role (for verification)
SELECT 
    COALESCE(user_role, 'NULL') as role,
    COUNT(*) as count,
    COUNT(CASE WHEN is_valid = true THEN 1 END) as valid
FROM active_sessions
GROUP BY user_role
ORDER BY count DESC;

-- Delete old sessions without user_role (optional - uncomment to run)
-- DELETE FROM active_sessions WHERE user_role IS NULL;

-- Final verification
SELECT 
    COUNT(*) as total_sessions, 
    COUNT(CASE WHEN user_role IS NULL THEN 1 END) as null_roles,
    COUNT(CASE WHEN is_valid = true THEN 1 END) as valid_sessions
FROM active_sessions;
