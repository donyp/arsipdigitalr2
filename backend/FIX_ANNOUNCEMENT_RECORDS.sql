-- Fix missing announcement read records for all users
-- Run this on your database to ensure all users have read records for their eligible announcements

BEGIN;

-- First, ensure all users have read records for all_users announcements
INSERT INTO announcement_reads (announcement_id, user_id, is_read, read_at)
SELECT a.id, u.id, false, NULL
FROM announcements a
CROSS JOIN users u
WHERE a.is_active = TRUE
  AND u.is_active = TRUE
  AND a.recipient_type = 'all_users'
  AND NOT EXISTS (
    SELECT 1 FROM announcement_reads ar
    WHERE ar.announcement_id = a.id AND ar.user_id = u.id
  )
ON CONFLICT (announcement_id, user_id) DO NOTHING;

-- Ensure all zona users have read records for all_zonas announcements
INSERT INTO announcement_reads (announcement_id, user_id, is_read, read_at)
SELECT a.id, u.id, false, NULL
FROM announcements a
CROSS JOIN users u
WHERE a.is_active = TRUE
  AND u.is_active = TRUE
  AND u.zona_id IS NOT NULL
  AND a.recipient_type = 'all_zonas'
  AND NOT EXISTS (
    SELECT 1 FROM announcement_reads ar
    WHERE ar.announcement_id = a.id AND ar.user_id = u.id
  )
ON CONFLICT (announcement_id, user_id) DO NOTHING;

-- Ensure users have read records for specific_zonas announcements
INSERT INTO announcement_reads (announcement_id, user_id, is_read, read_at)
SELECT ar_map.announcement_id, u.id, false, NULL
FROM announcement_recipients ar_map
CROSS JOIN users u
INNER JOIN announcements a ON a.id = ar_map.announcement_id
WHERE a.is_active = TRUE
  AND u.is_active = TRUE
  AND ar_map.recipient_type = 'zona'
  AND u.zona_id = ar_map.recipient_id
  AND NOT EXISTS (
    SELECT 1 FROM announcement_reads ar
    WHERE ar.announcement_id = ar_map.announcement_id AND ar.user_id = u.id
  )
ON CONFLICT (announcement_id, user_id) DO NOTHING;

-- Ensure users have read records for specific_users announcements
INSERT INTO announcement_reads (announcement_id, user_id, is_read, read_at)
SELECT ar_map.announcement_id, ar_map.recipient_id, false, NULL
FROM announcement_recipients ar_map
INNER JOIN users u ON u.id = ar_map.recipient_id
INNER JOIN announcements a ON a.id = ar_map.announcement_id
WHERE a.is_active = TRUE
  AND u.is_active = TRUE
  AND ar_map.recipient_type = 'user'
  AND NOT EXISTS (
    SELECT 1 FROM announcement_reads ar
    WHERE ar.announcement_id = ar_map.announcement_id AND ar.user_id = ar_map.recipient_id
  )
ON CONFLICT (announcement_id, user_id) DO NOTHING;

COMMIT;

-- Verify results
SELECT 
  'Total active announcements' as metric,
  COUNT(*) as count
FROM announcements
WHERE is_active = TRUE
UNION ALL
SELECT 
  'Total active users',
  COUNT(*)
FROM users
WHERE is_active = TRUE
UNION ALL
SELECT 
  'Total read records',
  COUNT(*)
FROM announcement_reads
UNION ALL
SELECT 
  'Unread announcements',
  COUNT(*)
FROM announcement_reads
WHERE is_read = FALSE;
