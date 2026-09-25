-- ============================================
-- MIGRATION: Add File Count Tracking Columns
-- ============================================
-- Run this in Supabase SQL Editor
-- Go to: https://app.supabase.com/project/_/sql/new
-- Paste ALL of this SQL and click RUN
-- ============================================

ALTER TABLE invoice_file_list 
ADD COLUMN IF NOT EXISTS files_uploaded_count INTEGER DEFAULT 0;

ALTER TABLE invoice_file_list 
ADD COLUMN IF NOT EXISTS files_required_count INTEGER DEFAULT 2;

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_invoice_file_list_upload_status 
ON invoice_file_list(files_uploaded_count, files_required_count)
WHERE files_uploaded_count < files_required_count;

-- Verify columns were created
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'invoice_file_list' 
AND column_name IN ('files_uploaded_count', 'files_required_count')
ORDER BY ordinal_position;
