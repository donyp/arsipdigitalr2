-- ============================================================
-- DELETE SEPTEMBER FILES FROM invoice_file_list TABLE
-- Menghapus semua invoice September dari tabel utama
-- ============================================================

-- SAFETY: Check how many records will be deleted
SELECT 
    COUNT(*) as total_invoices,
    COUNT(DISTINCT EXTRACT(MONTH FROM tanggal)) as unique_months,
    MIN(tanggal) as oldest_date,
    MAX(tanggal) as newest_date
FROM invoice_file_list
WHERE EXTRACT(MONTH FROM tanggal) = 9
AND EXTRACT(YEAR FROM tanggal) = 2026;

-- ============================================================
-- STEP 1: Delete invoices from invoice_file_list table (September 2026)
-- ============================================================
WITH deleted_rows AS (
    DELETE FROM invoice_file_list
    WHERE EXTRACT(MONTH FROM tanggal) = 9
    AND EXTRACT(YEAR FROM tanggal) = 2026
    RETURNING faktur, tanggal, toko
)
SELECT 
    'Deletion complete' as status, 
    COUNT(*) as rows_deleted,
    COUNT(DISTINCT toko) as unique_tokos,
    MAX(tanggal) as last_deleted_date
FROM deleted_rows;

-- ============================================================
-- VERIFY: Check remaining invoices and their date range
-- ============================================================
SELECT 
    COUNT(*) as remaining_invoices,
    COUNT(DISTINCT EXTRACT(MONTH FROM tanggal)) as months_with_data,
    COUNT(DISTINCT toko) as unique_tokos,
    MIN(tanggal) as oldest_invoice,
    MAX(tanggal) as newest_invoice
FROM invoice_file_list;

-- ============================================================
-- OPTIONAL: Check if any September files remain in invoice_files
-- ============================================================
SELECT 
    COUNT(*) as september_files_remaining,
    COUNT(DISTINCT faktur) as september_invoices_remaining
FROM invoice_files
WHERE EXTRACT(MONTH FROM uploaded_at) = 9
AND EXTRACT(YEAR FROM uploaded_at) = 2026;
