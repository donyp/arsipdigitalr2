-- FIX: Sync announcements for zona 2

-- Step 1: Check what announcements exist for zona 1
-- Get all announcements that have zona 1 recipients
SELECT DISTINCT a.id, a.title, a.recipient_type
FROM announcements a
LEFT JOIN announcement_recipients ar ON a.id = ar.announcement_id AND ar.recipient_type = 'zona' AND ar.recipient_id = 1
WHERE a.is_active = true AND a.recipient_type = 'specific_zonas'
ORDER BY a.created_at DESC;

-- Step 2: For each specific_zonas announcement that exists for zona 1,
-- make sure it also exists for zona 2 if it should be visible to all zones

-- Get announcement IDs that should be visible to zone 2
-- (specific_zonas announcements that have recipients)
SELECT DISTINCT announcement_id
FROM announcement_recipients
WHERE recipient_type = 'zona' AND recipient_id = 1;

-- Step 3: Create missing announcement_recipients for zona 2
-- This assumes: if an announcement is for zona 1, it might need to be for zona 2 too
INSERT INTO announcement_recipients (announcement_id, recipient_type, recipient_id, created_at)
SELECT 
  announcement_id,
  'zona' as recipient_type,
  2 as recipient_id,
  NOW() as created_at
FROM announcement_recipients ar1
WHERE ar1.recipient_type = 'zona' 
  AND ar1.recipient_id = 1
  AND ar1.announcement_id NOT IN (
    SELECT announcement_id 
    FROM announcement_recipients 
    WHERE recipient_type = 'zona' AND recipient_id = 2
  )
ON CONFLICT DO NOTHING;

-- Step 4: Verify the fix
SELECT 'Zona 1 announcements' as check_type, COUNT(*) as count
FROM announcement_recipients
WHERE recipient_type = 'zona' AND recipient_id = 1;

SELECT 'Zona 2 announcements' as check_type, COUNT(*) as count
FROM announcement_recipients
WHERE recipient_type = 'zona' AND recipient_id = 2;