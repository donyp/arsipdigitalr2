/**
 * Script to check invoice database for invoices with PDF paths
 * Shows which invoices have invoice PDFs, bukti bayar, and faktur pajak uploaded
 * 
 * Usage: Run this query to see the current state of invoice file uploads
 */

-- ============================================================
-- 1. SUMMARY: Count invoices with/without each file type
-- ============================================================
SELECT 
    'Invoice PDFs' as file_type,
    COUNT(DISTINCT faktur) as total_with_file
FROM invoice_files
WHERE file_type = 'invoice'
UNION ALL
SELECT 
    'Bukti Bayar' as file_type,
    COUNT(DISTINCT faktur) as total_with_file
FROM invoice_files
WHERE file_type = 'bukti_bayar'
UNION ALL
SELECT 
    'Faktur Pajak' as file_type,
    COUNT(DISTINCT faktur) as total_with_file
FROM invoice_files
WHERE file_type = 'faktur_pajak'
UNION ALL
SELECT 
    'Total Invoices' as file_type,
    COUNT(DISTINCT faktur) as total_with_file
FROM invoice_files;

-- ============================================================
-- 2. LIST ALL INVOICES WITH THEIR PDF PATHS
-- ============================================================
SELECT 
    faktur,
    file_type,
    file_path,
    file_size,
    uploaded_at,
    uploaded_by
FROM invoice_files
ORDER BY faktur, file_type, uploaded_at DESC;

-- ============================================================
-- 3. DETAIL VIEW: Invoices with all file types (WIDE FORMAT)
-- ============================================================
SELECT 
    faktur,
    
    MAX(CASE WHEN file_type = 'invoice' THEN file_path END) as invoice_pdf_path,
    MAX(CASE WHEN file_type = 'invoice' THEN file_size END) as invoice_size,
    MAX(CASE WHEN file_type = 'invoice' THEN uploaded_at END) as invoice_uploaded_at,
    
    MAX(CASE WHEN file_type = 'bukti_bayar' THEN file_path END) as bukti_bayar_path,
    MAX(CASE WHEN file_type = 'bukti_bayar' THEN file_size END) as bukti_bayar_size,
    MAX(CASE WHEN file_type = 'bukti_bayar' THEN uploaded_at END) as bukti_bayar_uploaded_at,
    
    MAX(CASE WHEN file_type = 'faktur_pajak' THEN file_path END) as faktur_pajak_path,
    MAX(CASE WHEN file_type = 'faktur_pajak' THEN file_size END) as faktur_pajak_size,
    MAX(CASE WHEN file_type = 'faktur_pajak' THEN uploaded_at END) as faktur_pajak_uploaded_at
FROM invoice_files
GROUP BY faktur
ORDER BY faktur;

-- ============================================================
-- 4. CHECK: Invoices missing specific file types
-- ============================================================
SELECT 
    'Missing Invoice PDF' as missing_type,
    COUNT(*) as count
FROM (
    SELECT DISTINCT faktur
    FROM invoice_file_list
    EXCEPT
    SELECT DISTINCT faktur
    FROM invoice_files
    WHERE file_type = 'invoice'
) as missing
UNION ALL
SELECT 
    'Missing Bukti Bayar' as missing_type,
    COUNT(*) as count
FROM (
    SELECT DISTINCT faktur
    FROM invoice_file_list
    EXCEPT
    SELECT DISTINCT faktur
    FROM invoice_files
    WHERE file_type = 'bukti_bayar'
) as missing
UNION ALL
SELECT 
    'Missing Faktur Pajak' as missing_type,
    COUNT(*) as count
FROM (
    SELECT DISTINCT faktur
    FROM invoice_file_list
    EXCEPT
    SELECT DISTINCT faktur
    FROM invoice_files
    WHERE file_type = 'faktur_pajak'
) as missing;

-- ============================================================
-- 5. INVOICES WITH ALL FILES COMPLETE
-- ============================================================
SELECT 
    faktur,
    COUNT(DISTINCT file_type) as files_count,
    STRING_AGG(DISTINCT file_type, ', ' ORDER BY file_type) as file_types,
    MIN(uploaded_at) as first_upload,
    MAX(uploaded_at) as last_upload
FROM invoice_files
GROUP BY faktur
HAVING COUNT(DISTINCT file_type) = 3
ORDER BY faktur;

-- ============================================================
-- 6. INVOICES MISSING FILES (INCOMPLETE)
-- ============================================================
SELECT 
    faktur,
    COUNT(DISTINCT file_type) as files_uploaded,
    3 - COUNT(DISTINCT file_type) as files_missing,
    STRING_AGG(DISTINCT file_type, ', ' ORDER BY file_type) as uploaded_types
FROM invoice_files
GROUP BY faktur
HAVING COUNT(DISTINCT file_type) < 3
ORDER BY faktur;

-- ============================================================
-- 7. STORAGE USAGE BREAKDOWN
-- ============================================================
SELECT 
    file_type,
    COUNT(*) as total_files,
    SUM(file_size) as total_size_bytes,
    ROUND(SUM(file_size)::NUMERIC / 1024 / 1024, 2) as total_size_mb,
    ROUND(AVG(file_size)::NUMERIC / 1024, 2) as avg_size_kb,
    MIN(file_size) as min_size_bytes,
    MAX(file_size) as max_size_bytes
FROM invoice_files
WHERE file_size IS NOT NULL
GROUP BY file_type
ORDER BY total_size_bytes DESC;

-- ============================================================
-- 8. RECENT UPLOADS (Last 50)
-- ============================================================
SELECT 
    faktur,
    file_type,
    file_path,
    file_size,
    uploaded_at,
    EXTRACT(EPOCH FROM (NOW() - uploaded_at))::INT as seconds_ago
FROM invoice_files
ORDER BY uploaded_at DESC
LIMIT 50;

-- ============================================================
-- 9. SPECIFIC INVOICE LOOKUP
-- ============================================================
-- Replace 'INV/123456' with actual faktur number
-- SELECT 
--     faktur,
--     file_type,
--     file_path,
--     file_size,
--     uploaded_at,
--     uploaded_by
-- FROM invoice_files
-- WHERE faktur = 'INV/123456'
-- ORDER BY file_type;
