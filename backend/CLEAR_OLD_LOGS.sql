-- ============================================================
-- Clear Old Supabase Logs to Reduce Ingestion
-- ============================================================
-- WARNING: This deletes logs from storage.objects table
-- Supabase may reject this due to protection, in which case
-- use the API method instead
-- ============================================================

-- Method 1: Delete via storage.objects (may be blocked)
-- Keep only logs from last 7 days
BEGIN;

DELETE FROM storage.objects 
WHERE 
    bucket_id IN (
        SELECT id FROM storage.buckets 
        WHERE name LIKE '%log%' OR name = 'system'
    )
    AND created_at < NOW() - INTERVAL '7 days';

COMMIT;

-- Check result
SELECT 
    COUNT(*) as remaining_objects,
    SUM(COALESCE(metadata->>'size', '0')::numeric) / 1024 / 1024 / 1024 as size_gb
FROM storage.objects;

-- ============================================================
-- Method 2: If Method 1 is blocked, use this instead
-- ============================================================
-- This truncates the audit_log_entries table which stores logs
-- WARNING: This deletes ALL audit logs (irreversible!)

-- TRUNCATE TABLE audit_log_entries CASCADE;

-- ============================================================
-- Method 3: Delete logs older than specific date
-- ============================================================
-- DELETE FROM storage.objects 
-- WHERE created_at < '2026-10-08'::timestamp;  -- Keep logs after this date

-- ============================================================
-- Check current database size
-- ============================================================
SELECT 
    pg_size_pretty(pg_database_size(current_database())) as total_size,
    pg_size_pretty(pg_total_relation_size('storage.objects')) as storage_objects_size,
    pg_size_pretty(pg_total_relation_size('audit_log_entries')) as audit_log_size;

-- ============================================================
-- If storage tables are protected, clear via this approach:
-- ============================================================
-- Connect to Supabase SQL Editor and run:
-- SELECT storage.farbytea('remove_old_objects');
