-- ============================================================
-- AUTO-SYNC NEW ZONES TO ANNOUNCEMENTS
-- ============================================================
-- When a new zona is created, automatically sync it to:
-- 1. All existing announcements targeted at all_zonas
-- 2. All active zona users get announcement_reads entries
--
-- This ensures that when a new zona is added, users in that zona
-- automatically see all announcements (no red dot loss)
-- ============================================================

-- Step 1: Find all announcements with recipient_type = 'all_zonas'
-- Then add announcement_recipients entries for the new zona
INSERT INTO announcement_recipients (
    announcement_id,
    recipient_type,
    recipient_id,
    created_at
)
SELECT 
    a.id,
    'zona',
    ? as zona_id,  -- Parameter: new_zona_id
    NOW()
FROM announcements a
WHERE a.recipient_type = 'all_zonas'
  AND a.is_active = true
  AND NOT EXISTS (
      SELECT 1 FROM announcement_recipients ar
      WHERE ar.announcement_id = a.id
        AND ar.recipient_type = 'zona'
        AND ar.recipient_id = ?  -- Parameter: new_zona_id
  )
ON CONFLICT DO NOTHING;

-- Step 2: For each announcement, create announcement_reads for all active users in the new zona
INSERT INTO announcement_reads (
    announcement_id,
    user_id,
    is_read,
    read_at,
    created_at
)
SELECT 
    a.id,
    u.id,
    false,
    NULL,
    NOW()
FROM announcements a
CROSS JOIN users u
WHERE a.is_active = true
  AND u.zona_id = ?  -- Parameter: new_zona_id
  AND u.is_active = true
  AND (
      a.recipient_type = 'all_zonas'
      OR (
          a.recipient_type = 'specific_zonas'
          AND EXISTS (
              SELECT 1 FROM announcement_recipients ar
              WHERE ar.announcement_id = a.id
                AND ar.recipient_type = 'zona'
                AND ar.recipient_id = ?  -- Parameter: new_zona_id
          )
      )
  )
  AND NOT EXISTS (
      SELECT 1 FROM announcement_reads ar2
      WHERE ar2.announcement_id = a.id
        AND ar2.user_id = u.id
  )
ON CONFLICT DO NOTHING;
