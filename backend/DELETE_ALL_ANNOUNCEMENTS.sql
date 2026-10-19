-- Delete all announcements and related data
-- This script will:
-- 1. Delete all announcement read records
-- 2. Delete all announcement recipients
-- 3. Delete all announcements

BEGIN;

-- Count before deletion
SELECT COUNT(*) as "Total Announcements" FROM announcements;
SELECT COUNT(*) as "Total Read Records" FROM announcement_reads;
SELECT COUNT(*) as "Total Recipients" FROM announcement_recipients;

-- Delete all announcement read records (FK dependency)
DELETE FROM announcement_reads;
RAISE NOTICE 'Deleted % announcement read records', ROW_COUNT;

-- Delete all announcement recipients (FK dependency)
DELETE FROM announcement_recipients;
RAISE NOTICE 'Deleted % announcement recipients', ROW_COUNT;

-- Delete all announcements
DELETE FROM announcements;
RAISE NOTICE 'Deleted % announcements', ROW_COUNT;

-- Reset auto-increment if using sequences
ALTER SEQUENCE announcements_id_seq RESTART WITH 1;

-- Verify deletion
SELECT COUNT(*) as "Announcements After Delete" FROM announcements;
SELECT COUNT(*) as "Read Records After Delete" FROM announcement_reads;
SELECT COUNT(*) as "Recipients After Delete" FROM announcement_recipients;

COMMIT;

-- All announcements deleted successfully!
