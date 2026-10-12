-- ============================================================
-- DELETE SEPTEMBER FILES
-- Hapus semua file invoice yang di-upload bulan September
-- ============================================================

-- SAFETY: Check how many records will be deleted
SELECT 
    COUNT(*) as total_files,
    SUM(file_size) as total_size_bytes,
    ROUND(SUM(file_size)::numeric / 1024 / 1024 / 1024, 2) as total_size_gb,
    COUNT(DISTINCT faktur) as unique_invoices
FROM invoice_files
WHERE EXTRACT(MONTH FROM uploaded_at) = 9
AND EXTRACT(YEAR FROM uploaded_at) = 2026;

-- ============================================================
-- STEP 1: Delete files from invoice_files table (September 2026)
-- ============================================================
WITH deleted_rows AS (
    DELETE FROM invoice_files
    WHERE EXTRACT(MONTH FROM uploaded_at) = 9
    AND EXTRACT(YEAR FROM uploaded_at) = 2026
    RETURNING id
)
SELECT 
    'Deletion complete' as status, 
    COUNT(*) as rows_deleted
FROM deleted_rows;

-- ============================================================
-- VERIFY: Check remaining files
-- ============================================================
SELECT 
    COUNT(*) as remaining_files,
    COUNT(DISTINCT faktur) as invoices_with_files,
    EXTRACT(MONTH FROM MAX(uploaded_at)) as last_upload_month,
    EXTRACT(YEAR FROM MAX(uploaded_at)) as last_upload_year
FROM invoice_files;

-- ============================================================
-- OPTIONAL: If you want to delete ALL September files (all years)
-- Uncomment below and run separately:
-- ============================================================
/*
DELETE FROM invoice_files
WHERE EXTRACT(MONTH FROM uploaded_at) = 9;
*/

-- ============================================================
-- NOTE: 
-- This only deletes database records. R2 file storage must be 
-- deleted separately using R2 API or rclone if needed.
-- ============================================================
