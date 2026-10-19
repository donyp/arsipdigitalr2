-- Fix user name field: populate with username where name is missing or incorrect
-- Run this to fix greeting display issue

-- Update users where name is NULL or matches role pattern
UPDATE users
SET name = username
WHERE name IS NULL 
   OR name = ''
   OR name = 'moderator'
   OR name = 'admin'
   OR name = 'super_admin'
   OR name = 'User'
   OR name LIKE '%admin%'
   OR name LIKE '%moderator%'
   OR name LIKE '%super%';

-- Verify the changes
SELECT id, username, email, name, role FROM users LIMIT 10;
