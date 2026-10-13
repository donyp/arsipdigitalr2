-- ============================================================
-- RESET: DELETE ALL INVOICE DATA FROM DATABASE
-- ⚠️  WARNING: THIS IS DESTRUCTIVE - CANNOT BE UNDONE
-- ⚠️  Back up database before running this!
-- ============================================================

-- STEP 1: SAFETY CHECK - Count records before deletion
-- Run this first to see what will be deleted
SELECT 
    (SELECT COUNT(*) FROM invoice_file_list) as total_invoices,
    (SELECT COUNT(*) FROM invoice_files) as total_files,
    (SELECT COUNT(*) FROM excel_upload_batches) as total_batches;

-- ============================================================
-- STEP 2: DELETE ALL DATA (in correct dependency order)
-- ============================================================

-- 2.1: Delete file upload records (depends on invoice_file_list)
DELETE FROM invoice_files;

-- 2.2: Delete Excel batch tracking
DELETE FROM excel_upload_batches;

-- 2.3: Delete main invoice records (LAST - this is the big one)
DELETE FROM invoice_file_list;

-- ============================================================
-- STEP 3: VERIFY - All tables should be empty now
-- ============================================================
SELECT 
    'invoice_file_list' as table_name,
    COUNT(*) as remaining_records
FROM invoice_file_list

UNION ALL

SELECT 
    'invoice_files',
    COUNT(*)
FROM invoice_files

UNION ALL

SELECT 
    'excel_upload_batches',
    COUNT(*)
FROM excel_upload_batches;

-- ============================================================
-- SUCCESS: Database is now empty, ready for fresh data
-- ============================================================
-- Next steps:
-- 1. Manually delete all files in Cloudflare R2 bucket (ARSIP folder)
-- 2. Upload fresh invoice data (Excel)
-- 3. Upload PDF files (Invoice, Bukti Bayar, Faktur Pajak)
-- ============================================================
