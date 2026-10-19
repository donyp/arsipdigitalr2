-- Reset all announcement read records to unread (is_read = false)
-- Use this if announcement badge still shows 0 after creating records

BEGIN;

UPDATE announcement_reads
SET is_read = false, read_at = NULL
WHERE is_read = true;

COMMIT;

-- Verify
SELECT 
  COUNT(*) as total_records,
  SUM(CASE WHEN is_read = false THEN 1 ELSE 0 END) as unread,
  SUM(CASE WHEN is_read = true THEN 1 ELSE 0 END) as read
FROM announcement_reads;
