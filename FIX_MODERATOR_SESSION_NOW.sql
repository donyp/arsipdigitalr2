-- ============================================
-- EMERGENCY FIX: Moderator Still Has 2 Sessions
-- ============================================
-- Error: has 2/1 active sessions (should be 0/1)
-- This script will force clear ALL moderator sessions

-- Step 1: CHECK - Lihat berapa sessions moderator sekarang
SELECT 
    u.id,
    u.email,
    u.name,
    u.role,
    COUNT(us.id) as total_sessions,
    SUM(CASE WHEN us.is_active = TRUE THEN 1 ELSE 0 END) as active_sessions,
    SUM(CASE WHEN us.is_active = FALSE THEN 1 ELSE 0 END) as inactive_sessions,
    SUM(CASE WHEN us.expires_at < NOW() THEN 1 ELSE 0 END) as expired_count
FROM users u
LEFT JOIN user_sessions us ON u.id = us.user_id
WHERE u.role = 'moderator'
GROUP BY u.id, u.email, u.name, u.role;

-- Step 2: DETAIL - Lihat setiap session moderator
SELECT 
    u.email,
    u.name,
    us.id,
    us.session_token,
    us.is_active,
    us.created_at,
    us.expires_at,
    us.last_activity,
    CASE 
        WHEN us.expires_at < NOW() THEN 'EXPIRED'
        WHEN us.is_active = FALSE THEN 'INACTIVE'
        ELSE 'ACTIVE'
    END as current_status
FROM users u
JOIN user_sessions us ON u.id = us.user_id
WHERE u.role = 'moderator'
ORDER BY u.email, us.created_at DESC;

-- Step 3: FORCE CLEAR - Inactivate ALL moderator sessions (both active & inactive)
UPDATE user_sessions
SET is_active = FALSE
WHERE user_id IN (SELECT id FROM users WHERE role = 'moderator');

-- Step 4: VERIFY - Pastikan semua moderator sessions di-clear
SELECT 
    COUNT(*) as active_sessions_after_fix
FROM user_sessions
WHERE user_id IN (SELECT id FROM users WHERE role = 'moderator')
    AND is_active = TRUE;

-- Step 5: Optionally - Show final state
SELECT 
    u.email,
    COUNT(us.id) as total_sessions,
    SUM(CASE WHEN us.is_active = TRUE THEN 1 ELSE 0 END) as still_active,
    SUM(CASE WHEN us.is_active = FALSE THEN 1 ELSE 0 END) as now_inactive
FROM users u
LEFT JOIN user_sessions us ON u.id = us.user_id
WHERE u.role = 'moderator'
GROUP BY u.id, u.email;
