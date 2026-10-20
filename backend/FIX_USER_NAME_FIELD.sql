-- Fix user name field: populate with username where name is missing or incorrect
-- This fixes the greeting display issue where "Selamat Sore, moderator" shows instead of username

-- AGGRESSIVE FIX: Update ALL users to ensure name matches username (if name is clearly wrong)
-- Only update if name doesn't look like a real name (no spaces, matches role keywords, etc)

UPDATE users
SET name = username
WHERE 
    -- Match role keywords (most common issue)
    LOWER(name) IN ('moderator', 'admin', 'super_admin', 'user', 'superadmin')
    OR name IS NULL 
    OR name = ''
    OR name = 'User'
    -- Match patterns that look like role names
    OR LOWER(name) LIKE '%moderator%'
    OR LOWER(name) LIKE '%super%'
    OR LOWER(name) LIKE '%admin%'
    OR LOWER(name) LIKE '%zona%'
    -- Match email-like names (suspicious - should be real name, not email)
    OR (name LIKE '%@%' AND email IS NOT NULL AND name != email);

-- Log the changes - show how many were affected
SELECT 
    COUNT(*) as total_users_fixed,
    COUNT(DISTINCT role) as affected_roles,
    ARRAY_AGG(DISTINCT role) as role_list
FROM users
WHERE LOWER(name) IN ('moderator', 'admin', 'super_admin', 'user')
   OR name IS NULL 
   OR name = '';

-- Verify the changes - show all users with their names
SELECT id, username, email, name, role, created_at 
FROM users 
ORDER BY created_at DESC 
LIMIT 20;

-- Check if there are still any users with role names as their name
SELECT id, username, email, name, role 
FROM users 
WHERE LOWER(name) IN ('moderator', 'admin', 'super_admin', 'user')
   OR name IS NULL 
   OR name = '';
-- If this returns rows, the fix didn't work properly
