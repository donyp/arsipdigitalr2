-- ============================================
-- CLEAR MODERATOR SESSIONS - SQL Script
-- ============================================
-- Clear all sessions untuk moderator account
-- Gunakan script ini jika dashboard tidak bisa diakses
-- atau untuk emergency cleanup

-- ============================================
-- OPTION 1: Lihat semua moderator sessions
-- ============================================

-- Step 1: Cari moderator user ID
SELECT 
    u.id,
    u.email,
    u.name,
    u.role,
    COUNT(us.id) as total_sessions,
    SUM(CASE WHEN us.is_active = TRUE THEN 1 ELSE 0 END) as active_sessions,
    SUM(CASE WHEN us.is_active = FALSE THEN 1 ELSE 0 END) as inactive_sessions
FROM users u
LEFT JOIN user_sessions us ON u.id = us.user_id
WHERE u.role = 'moderator'
GROUP BY u.id, u.email, u.name, u.role
ORDER BY u.created_at;

-- ============================================
-- OPTION 2: Lihat detail semua moderator sessions
-- ============================================

-- Step 2: Lihat detail setiap session moderator
SELECT 
    u.id as user_id,
    u.email,
    u.name,
    us.id as session_id,
    us.session_token,
    us.created_at,
    us.expires_at,
    us.is_active,
    us.last_activity,
    us.ip_address,
    us.user_agent,
    (NOW() - us.last_activity) as time_since_activity,
    CASE 
        WHEN us.expires_at < NOW() THEN 'EXPIRED'
        WHEN us.is_active = FALSE THEN 'INACTIVE'
        ELSE 'ACTIVE'
    END as status
FROM users u
JOIN user_sessions us ON u.id = us.user_id
WHERE u.role = 'moderator'
ORDER BY u.email, us.created_at DESC;

-- ============================================
-- OPTION 3: Lihat moderator sessions yg ACTIVE
-- ============================================

-- Step 3: Lihat HANYA active sessions moderator
SELECT 
    u.id as user_id,
    u.email,
    u.name,
    COUNT(us.id) as active_count,
    STRING_AGG(us.session_token, ' | ') as tokens,
    MIN(us.created_at) as oldest_session,
    MAX(us.last_activity) as latest_activity
FROM users u
JOIN user_sessions us ON u.id = us.user_id
WHERE u.role = 'moderator'
    AND us.is_active = TRUE
GROUP BY u.id, u.email, u.name
ORDER BY active_count DESC;

-- ============================================
-- OPTION 4: CLEAR - Inactivate semua sessions moderator
-- ============================================

-- Step 4a: BACKUP - Lihat berapa yang akan di-clear
SELECT 
    COUNT(*) as sessions_to_clear,
    COUNT(DISTINCT user_id) as moderators_affected
FROM user_sessions
WHERE user_id IN (SELECT id FROM users WHERE role = 'moderator')
    AND is_active = TRUE;

-- Step 4b: EXECUTE - Clear semua active sessions moderator
UPDATE user_sessions
SET is_active = FALSE,
    updated_at = NOW()
WHERE user_id IN (SELECT id FROM users WHERE role = 'moderator')
    AND is_active = TRUE;

-- Step 4c: VERIFY - Lihat hasil setelah clear
SELECT 
    COUNT(*) as remaining_active_sessions
FROM user_sessions
WHERE user_id IN (SELECT id FROM users WHERE role = 'moderator')
    AND is_active = TRUE;

-- ============================================
-- OPTION 5: CLEAR - Untuk moderator tertentu
-- ============================================

-- Step 5a: Ganti 'moderator@example.com' dengan email moderator yang ingin di-clear
SELECT 
    u.id,
    u.email,
    COUNT(us.id) as total_sessions,
    SUM(CASE WHEN us.is_active = TRUE THEN 1 ELSE 0 END) as active_sessions
FROM users u
LEFT JOIN user_sessions us ON u.id = us.user_id
WHERE u.email = 'moderator@example.com'  -- ← UBAH EMAIL INI
GROUP BY u.id, u.email;

-- Step 5b: Clear hanya untuk moderator tertentu
UPDATE user_sessions
SET is_active = FALSE,
    updated_at = NOW()
WHERE user_id = (SELECT id FROM users WHERE email = 'moderator@example.com')  -- ← UBAH EMAIL INI
    AND is_active = TRUE;

-- Step 5c: Verify
SELECT 
    COUNT(*) as remaining_active_sessions
FROM user_sessions
WHERE user_id = (SELECT id FROM users WHERE email = 'moderator@example.com')  -- ← UBAH EMAIL INI
    AND is_active = TRUE;

-- ============================================
-- OPTION 6: CLEAR + LOG - Track apa yang di-clear
-- ============================================

-- Step 6a: Create temp table untuk backup sessions yg akan di-clear
CREATE TEMP TABLE cleared_sessions_backup AS
SELECT 
    user_id,
    session_token,
    created_at,
    expires_at,
    is_active,
    last_activity,
    NOW() as cleared_at
FROM user_sessions
WHERE user_id IN (SELECT id FROM users WHERE role = 'moderator')
    AND is_active = TRUE;

-- Step 6b: Clear sessions
UPDATE user_sessions
SET is_active = FALSE,
    updated_at = NOW()
WHERE user_id IN (SELECT id FROM users WHERE role = 'moderator')
    AND is_active = TRUE;

-- Step 6c: Show backup data
SELECT 
    *,
    (expires_at - created_at) as session_duration_hours
FROM cleared_sessions_backup
ORDER BY cleared_at DESC;

-- ============================================
-- OPTION 7: FULL CLEANUP - Moderator Tertentu
-- ============================================

-- Step 7: Comprehensive cleanup untuk 1 moderator
-- Replace 'moderator' dengan email moderator yang stuck

WITH moderator_data AS (
    SELECT 
        id,
        email,
        name
    FROM users 
    WHERE email = 'moderator'  -- ← UBAH INI
),
sessions_before AS (
    SELECT COUNT(*) as before_count
    FROM user_sessions
    WHERE user_id IN (SELECT id FROM moderator_data)
        AND is_active = TRUE
)
UPDATE user_sessions
SET 
    is_active = FALSE,
    updated_at = NOW()
WHERE user_id IN (SELECT id FROM moderator_data)
    AND is_active = TRUE
RETURNING 
    user_id,
    session_token,
    created_at,
    expires_at,
    updated_at;

-- ============================================
-- OPTION 8: DELETE (Nuclear Option)
-- ============================================
-- WARNING: HATI-HATI! Delete adalah destructive
-- Lebih aman gunakan UPDATE is_active = FALSE

-- Jika ingin DELETE (bukan update):
DELETE FROM user_sessions
WHERE user_id IN (SELECT id FROM users WHERE role = 'moderator')
    AND expires_at < NOW();  -- Hanya delete yang sudah expired

-- ============================================
-- OPTION 9: Statistics & Audit
-- ============================================

-- Step 9a: Lihat statistics moderator sessions
SELECT 
    u.email,
    COUNT(us.id) as total_sessions,
    SUM(CASE WHEN us.is_active = TRUE THEN 1 ELSE 0 END) as active,
    SUM(CASE WHEN us.is_active = FALSE THEN 1 ELSE 0 END) as inactive,
    MIN(us.created_at) as oldest_session,
    MAX(us.created_at) as newest_session,
    ROUND(AVG(EXTRACT(EPOCH FROM (us.expires_at - us.created_at))/3600)::numeric, 2) as avg_session_hours
FROM users u
LEFT JOIN user_sessions us ON u.id = us.user_id
WHERE u.role = 'moderator'
GROUP BY u.id, u.email
ORDER BY total_sessions DESC;

-- Step 9b: Lihat audit log untuk moderator force logouts
SELECT 
    action,
    resource_name,
    created_at,
    user_email,
    details
FROM audit_logs
WHERE action LIKE '%Force Logout%'
    AND (resource_name LIKE '%moderator%' OR details::text LIKE '%moderator%')
ORDER BY created_at DESC
LIMIT 20;

-- ============================================
-- QUICK REFERENCE
-- ============================================
-- 
-- Untuk CLEAR semua moderator sessions:
-- 1. Buka Supabase dashboard
-- 2. Go to: SQL Editor
-- 3. Jalankan OPTION 4b (Step 4b)
-- 4. Verify dengan Step 4c
--
-- Untuk CLEAR moderator tertentu:
-- 1. Jalankan Step 5a untuk find moderator
-- 2. Ubah email di Step 5b
-- 3. Jalankan Step 5b untuk clear
-- 4. Verify dengan Step 5c
--
-- ============================================
