-- Debug: Check why zona 2 has no unread announcement badge

-- 1. Count total announcements
SELECT 'Total active announcements' as check_type, COUNT(*) as count
FROM announcements WHERE is_active = true;

-- 2. Check announcement distribution by type
SELECT 
  recipient_type,
  COUNT(*) as count
FROM announcements
WHERE is_active = true
GROUP BY recipient_type;

-- 3. Check zone recipients for zona 1
SELECT 'Recipients for zona 1' as check_type, COUNT(*) as count
FROM announcement_recipients
WHERE recipient_type = 'zona' AND recipient_id = 1;

-- 4. Check zone recipients for zona 2
SELECT 'Recipients for zona 2' as check_type, COUNT(*) as count
FROM announcement_recipients
WHERE recipient_type = 'zona' AND recipient_id = 2;

-- 5. Check unread status for zona 1 users
SELECT 
  'Unread in zona 1' as check_type,
  COUNT(*) as count
FROM announcement_reads
WHERE is_read = false;

-- 6. Check announcement_recipients table structure
SELECT * FROM announcement_recipients LIMIT 5;

-- 7. Check if there's a mismatch between announcements and recipients
SELECT 
  a.id,
  a.recipient_type,
  ar.announcement_id,
  ar.recipient_type,
  ar.recipient_id
FROM announcements a
LEFT JOIN announcement_recipients ar ON a.id = ar.announcement_id
WHERE a.recipient_type = 'specific_zonas'
LIMIT 10;