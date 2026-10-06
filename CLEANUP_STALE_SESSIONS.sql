-- ============================================
-- CLEANUP STALE SESSIONS - Emergency Fix
-- For moderator stuck with 1/1 active session
-- ============================================

-- 1. First, let's see what stale sessions exist
SELECT 
    id,
    user_id,
    session_token,
    created_at,
    expires_at,
    is_active,
    CASE 
        WHEN expires_at < NOW() THEN 'EXPIRED'
        WHEN is_active = FALSE THEN 'INACTIVE'
        ELSE 'ACTIVE'
    END as status
FROM user_sessions
WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE 'moderator%' OR role = 'moderator'
)
ORDER BY created_at DESC;

-- 2. Force cleanup all stale sessions for moderator users
UPDATE user_sessions
SET is_active = FALSE
WHERE expires_at < NOW() 
AND is_active = TRUE
AND user_id IN (
    SELECT id FROM users WHERE email LIKE 'moderator%' OR role = 'moderator'
);

-- 3. Or more directly - find the specific moderator user and terminate ALL sessions
UPDATE user_sessions
SET is_active = FALSE
WHERE user_id = (SELECT id FROM users WHERE email = 'moderator' LIMIT 1);

-- 4. Verify cleanup
SELECT 
    COUNT(*) as active_sessions,
    user_id
FROM user_sessions
WHERE is_active = TRUE
AND expires_at > NOW()
AND user_id IN (
    SELECT id FROM users WHERE email LIKE 'moderator%' OR role = 'moderator'
)
GROUP BY user_id;

-- 5. Check all sessions for this moderator (for audit)
SELECT 
    id,
    session_token,
    created_at,
    expires_at,
    is_active
FROM user_sessions
WHERE user_id = (SELECT id FROM users WHERE email = 'moderator' LIMIT 1)
ORDER BY created_at DESC
LIMIT 10;
