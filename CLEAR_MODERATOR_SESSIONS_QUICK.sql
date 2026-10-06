-- ============================================
-- QUICK CLEAR - Moderator Sessions
-- ============================================
-- Copy-paste langsung, jangan perlu edit
-- Ini akan clear SEMUA active sessions untuk SEMUA moderator

-- Step 1: Lihat berapa sessions yang akan di-clear
SELECT 
    u.email,
    u.name,
    COUNT(us.id) as active_sessions,
    STRING_AGG(us.session_token::text, ', ') as tokens
FROM users u
JOIN user_sessions us ON u.id = us.user_id
WHERE u.role = 'moderator'
    AND us.is_active = TRUE
GROUP BY u.id, u.email, u.name;

-- Step 2: CLEAR - Inactivate semua active moderator sessions
UPDATE user_sessions
SET is_active = FALSE
WHERE user_id IN (SELECT id FROM users WHERE role = 'moderator')
    AND is_active = TRUE;

-- Step 3: VERIFY - Confirm berhasil di-clear
SELECT 
    u.email,
    COUNT(us.id) as remaining_active_sessions
FROM users u
LEFT JOIN user_sessions us ON u.id = us.user_id 
    AND us.is_active = TRUE
WHERE u.role = 'moderator'
GROUP BY u.id, u.email
HAVING COUNT(us.id) = 0;  -- Should show all moderators dengan 0 active sessions

-- ============================================
-- For specific moderator email:
-- ============================================

-- Uncomment dan edit email untuk clear specific moderator
-- Replace 'moderator@email.com' dengan actual email

-- SELECT * FROM user_sessions 
-- WHERE user_id = (SELECT id FROM users WHERE email = 'moderator@email.com' AND is_active = TRUE);

-- UPDATE user_sessions
-- SET is_active = FALSE, updated_at = NOW()
-- WHERE user_id = (SELECT id FROM users WHERE email = 'moderator@email.com')
--   AND is_active = TRUE;
