-- Fix Announcement Timezone Issue
-- Convert TIMESTAMP to TIMESTAMPTZ for explicit timezone handling
-- This ensures announcement timestamps are stored with timezone information (UTC)
-- and can be correctly converted to any timezone when displayed

-- Step 1: Alter announcements table to use TIMESTAMPTZ (with timezone)
ALTER TABLE announcements
    ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE USING updated_at AT TIME ZONE 'UTC';

-- Step 2: Update DEFAULT to explicitly use UTC
ALTER TABLE announcements
    ALTER COLUMN created_at SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    ALTER COLUMN updated_at SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- Step 3: Alter announcement_reads table to use TIMESTAMPTZ as well (for consistency)
ALTER TABLE announcement_reads
    ALTER COLUMN read_at TYPE TIMESTAMP WITH TIME ZONE USING COALESCE(read_at, CURRENT_TIMESTAMP) AT TIME ZONE 'UTC',
    ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE USING created_at AT TIME ZONE 'UTC';

ALTER TABLE announcement_reads
    ALTER COLUMN created_at SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- Verify the changes
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns
WHERE table_name IN ('announcements', 'announcement_reads')
    AND column_name IN ('created_at', 'updated_at', 'read_at')
ORDER BY table_name, ordinal_position;

-- Test: Check if data is stored correctly with timezone
SELECT 
    id, 
    title,
    created_at AT TIME ZONE 'Asia/Jakarta' as created_at_wib,
    created_at AT TIME ZONE 'UTC' as created_at_utc
FROM announcements
LIMIT 5;
