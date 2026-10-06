-- ============================================
-- CLEANUP STALE SESSIONS - Emergency Fix
-- For moderator stuck with 1/1 active session
-- ============================================

-- Step 0: Get moderator user ID
SELECT id, email, role FROM users WHERE email = 'moderator' OR role = 'moderator' LIMIT 1;

-- Step 1: Check ALL sessions for moderator (including non-expired)
SELECT 
    id,
    user_id,
    session_token,
    created_at,
    expires_at,
    is_active,
    NOW() as current_time,
    (expires_at - NOW()) as time_remaining,
    CASE 
        WHEN expires_at < NOW() THEN 'EXPIRED'
        WHEN is_active = FALSE THEN 'INACTIVE'
        ELSE 'ACTIVE'
    END as status
FROM user_sessions
WHERE user_id = (SELECT id FROM users WHERE email = 'moderator' LIMIT 1)
ORDER BY created_at DESC;

-- Step 2: Show count of active sessions
SELECT 
    COUNT(*) as active_session_count,
    SUM(CASE WHEN expires_at > NOW() THEN 1 ELSE 0 END) as non_expired_count,
    SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) as marked_active_count
FROM user_sessions
WHERE user_id = (SELECT id FROM users WHERE email = 'moderator' LIMIT 1);

-- Step 3: FORCE TERMINATE ALL sessions for moderator (both expired and non-expired)
UPDATE user_sessions
SET is_active = FALSE
WHERE user_id = (SELECT id FROM users WHERE email = 'moderator' LIMIT 1)
AND is_active = TRUE;

-- Step 4: Verify all sessions are now inactive
SELECT 
    COUNT(*) as active_sessions_after_cleanup
FROM user_sessions
WHERE user_id = (SELECT id FROM users WHERE email = 'moderator' LIMIT 1)
AND is_active = TRUE;

-- Step 5: Show final state of all moderator sessions
SELECT 
    id,
    session_token,
    created_at,
    expires_at,
    is_active
FROM user_sessions
WHERE user_id = (SELECT id FROM users WHERE email = 'moderator' LIMIT 1)
ORDER BY created_at DESC;
