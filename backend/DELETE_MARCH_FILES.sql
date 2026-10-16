-- ============================================================
-- DELETE MARCH FILES
-- Hapus semua invoice dari bulan Maret di table invoice_file_list
-- ============================================================

-- SAFETY: Check how many records will be deleted
SELECT 
    COUNT(*) as total_invoices,
    COUNT(DISTINCT toko) as unique_tokos,
    COUNT(DISTINCT zona_id) as unique_zonas,
    MIN(tanggal) as earliest_date,
    MAX(tanggal) as latest_date
FROM invoice_file_list
WHERE EXTRACT(MONTH FROM tanggal) = 3
AND EXTRACT(YEAR FROM tanggal) = 2026;

-- ============================================================
-- STEP 1: Show invoices yang akan dihapus (Preview)
-- ============================================================
SELECT 
    faktur,
    tanggal,
    toko,
    metode_bayar,
    total_jumlah_jual as total,
    status,
    invoice_pdf_uploaded,
    bukti_bayar_uploaded,
    faktur_pajak_uploaded
FROM invoice_file_list
WHERE EXTRACT(MONTH FROM tanggal) = 3
AND EXTRACT(YEAR FROM tanggal) = 2026
ORDER BY tanggal DESC, faktur;

-- ============================================================
-- STEP 2: Delete from invoice_file_list (March 2026)
-- ============================================================
WITH deleted_rows AS (
    DELETE FROM invoice_file_list
    WHERE EXTRACT(MONTH FROM tanggal) = 3
    AND EXTRACT(YEAR FROM tanggal) = 2026
    RETURNING faktur
)
SELECT 
    'Deletion complete' as status, 
    COUNT(*) as invoices_deleted,
    COUNT(DISTINCT faktur) as unique_fakturs_deleted
FROM deleted_rows;

-- ============================================================
-- STEP 3: Delete associated files from invoice_files table
-- ============================================================
-- Note: This assumes invoice_files table links via faktur column
-- If structure is different, adjust WHERE clause accordingly
WITH deleted_files AS (
    DELETE FROM invoice_files
    WHERE faktur IN (
        SELECT faktur FROM invoice_file_list
        WHERE EXTRACT(MONTH FROM tanggal) = 3
        AND EXTRACT(YEAR FROM tanggal) = 2026
    )
    RETURNING faktur, file_type
)
SELECT 
    'Files deleted' as status,
    COUNT(*) as total_files,
    COUNT(DISTINCT faktur) as invoices_affected,
    STRING_AGG(DISTINCT file_type, ', ' ORDER BY file_type) as file_types_deleted
FROM deleted_files;

-- ============================================================
-- VERIFY: Check remaining data
-- ============================================================
SELECT 
    COUNT(*) as remaining_invoices,
    COUNT(DISTINCT toko) as remaining_tokos,
    EXTRACT(MONTH FROM MIN(tanggal)) as earliest_month,
    EXTRACT(YEAR FROM MIN(tanggal)) as earliest_year,
    EXTRACT(MONTH FROM MAX(tanggal)) as latest_month,
    EXTRACT(YEAR FROM MAX(tanggal)) as latest_year
FROM invoice_file_list;

-- ============================================================
-- SUMMARY: Invoices by month (after deletion)
-- ============================================================
SELECT 
    EXTRACT(YEAR FROM tanggal) as year,
    EXTRACT(MONTH FROM tanggal) as month,
    TO_CHAR(tanggal, 'MMMM YYYY') as month_year,
    COUNT(*) as invoice_count,
    COUNT(DISTINCT toko) as toko_count,
    SUM(total_jumlah_jual) as total_amount
FROM invoice_file_list
GROUP BY EXTRACT(YEAR FROM tanggal), EXTRACT(MONTH FROM tanggal), TO_CHAR(tanggal, 'MMMM YYYY')
ORDER BY year DESC, month DESC;

-- ============================================================
-- NOTE: 
-- 1. This script deletes:
--    - Records from invoice_file_list table (March 2026)
--    - Associated files from invoice_files table
--    
-- 2. R2 file storage must be deleted separately if needed
--    using R2 API or rclone tool
--    
-- 3. For different month/year, change:
--    EXTRACT(MONTH FROM tanggal) = 3  (change 3 to desired month)
--    EXTRACT(YEAR FROM tanggal) = 2026  (change to desired year)
--    
-- 4. Months: 1=Jan, 2=Feb, 3=Mar, 4=Apr, 5=May, 6=Jun,
--           7=Jul, 8=Aug, 9=Sep, 10=Oct, 11=Nov, 12=Dec
-- ============================================================
