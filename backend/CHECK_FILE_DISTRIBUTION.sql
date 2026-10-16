/**
 * ================================================================
 * CHECK FILE DISTRIBUTION
 * ================================================================
 * 
 * Understand why all 7,650 are PARTIAL not COMPLETE
 * 
 * ================================================================
 */

-- ================================================================
-- Q1: How many files per invoice (distribution)
-- ================================================================

SELECT 
    files_uploaded_count || '/' || files_required_count as progress,
    COUNT(*) as invoices,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage,
    SUM(files_uploaded_count) as total_files
FROM invoice_file_list
WHERE DATE(updated_at) = CURRENT_DATE
GROUP BY files_uploaded_count, files_required_count
ORDER BY files_uploaded_count DESC;

-- ================================================================
-- Q2: What file types are uploaded?
-- ================================================================

SELECT 
    file_type,
    COUNT(*) as total_count,
    COUNT(DISTINCT faktur) as unique_invoices,
    ROUND(AVG(file_size) / 1024 / 1024, 2) as avg_size_mb,
    ROUND(MAX(file_size) / 1024 / 1024, 2) as max_size_mb
FROM invoice_files
WHERE DATE(uploaded_at) = CURRENT_DATE
GROUP BY file_type
ORDER BY COUNT(*) DESC;

-- ================================================================
-- Q3: Breakdown - which invoices have which files
-- ================================================================

WITH file_summary AS (
    SELECT 
        faktur,
        BOOL_OR(file_type = 'invoice') as has_invoice,
        BOOL_OR(file_type = 'bukti_bayar') as has_bukti,
        BOOL_OR(file_type = 'faktur_pajak') as has_pajak,
        COUNT(DISTINCT file_type) as file_count
    FROM invoice_files
    WHERE DATE(uploaded_at) = CURRENT_DATE
    GROUP BY faktur
)
SELECT 
    CASE 
        WHEN has_invoice AND has_bukti AND has_pajak THEN '✅ 3/3 Complete (Invoice + Bukti + Pajak)'
        WHEN has_invoice AND has_bukti THEN '⚠️ 2/3 (Invoice + Bukti only)'
        WHEN has_invoice AND has_pajak THEN '⚠️ 2/3 (Invoice + Pajak only)'
        WHEN has_bukti AND has_pajak THEN '⚠️ 2/3 (Bukti + Pajak only)'
        WHEN has_invoice THEN '⚠️ 1/3 (Invoice only)'
        WHEN has_bukti THEN '⚠️ 1/3 (Bukti only)'
        WHEN has_pajak THEN '⚠️ 1/3 (Pajak only)'
    END as file_combination,
    COUNT(*) as invoices,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM file_summary
GROUP BY file_combination
ORDER BY COUNT(*) DESC;

-- ================================================================
-- Q4: Expected vs Actual - PPN analysis
-- ================================================================

SELECT 
    CASE WHEN ifl.keterangan = 'PPN' THEN '✅ PPN (3 files required)'
         ELSE '❌ NON (2 files required)' 
    END as type,
    COUNT(*) as invoices,
    AVG(ifl.files_uploaded_count) as avg_files_uploaded,
    AVG(ifl.files_required_count) as required,
    COUNT(CASE WHEN ifl.files_uploaded_count >= ifl.files_required_count THEN 1 END) as complete_count
FROM invoice_file_list ifl
WHERE DATE(ifl.updated_at) = CURRENT_DATE
GROUP BY ifl.keterangan;

-- ================================================================
-- Q5: Sample invoices - what files they have
-- ================================================================

SELECT 
    ifl.faktur,
    ifl.toko,
    ifl.keterangan,
    ifl.files_uploaded_count || '/' || ifl.files_required_count as progress,
    STRING_AGG(DISTINCT ifx.file_type, ', ' ORDER BY ifx.file_type) as file_types,
    COUNT(DISTINCT ifx.id) as file_count
FROM invoice_file_list ifl
LEFT JOIN invoice_files ifx ON ifx.faktur = ifl.faktur
WHERE DATE(ifl.updated_at) = CURRENT_DATE
  AND ifl.files_uploaded_count > 0
GROUP BY ifl.faktur, ifl.toko, ifl.keterangan, ifl.files_uploaded_count, ifl.files_required_count
ORDER BY ifl.files_uploaded_count DESC
LIMIT 30;

-- ================================================================
-- Q6: Summary - What's missing
-- ================================================================

SELECT 
    'Total Files Expected' as metric,
    SUM(files_required_count)::TEXT as value
FROM invoice_file_list
WHERE DATE(updated_at) = CURRENT_DATE
  AND files_uploaded_count > 0

UNION ALL

SELECT 
    'Total Files Uploaded',
    SUM(files_uploaded_count)::TEXT
FROM invoice_file_list
WHERE DATE(updated_at) = CURRENT_DATE
  AND files_uploaded_count > 0

UNION ALL

SELECT 
    'Files Missing',
    (SUM(files_required_count) - SUM(files_uploaded_count))::TEXT
FROM invoice_file_list
WHERE DATE(updated_at) = CURRENT_DATE
  AND files_uploaded_count > 0

UNION ALL

SELECT 
    'Completion Rate (%)',
    ROUND(100.0 * SUM(files_uploaded_count) / SUM(files_required_count), 2)::TEXT
FROM invoice_file_list
WHERE DATE(updated_at) = CURRENT_DATE
  AND files_uploaded_count > 0;

/**
 * ================================================================
 * EXPECTED BEHAVIOR (based on system design):
 * ================================================================
 * 
 * PPN Invoices (keterangan = 'PPN'):
 *   - Required files: 3 (Invoice PDF + Bukti Bayar + Faktur Pajak)
 *   - Complete when: files_uploaded_count >= 3
 * 
 * NON PPN Invoices (keterangan != 'PPN'):
 *   - Required files: 2 (Invoice PDF + Bukti Bayar)
 *   - Complete when: files_uploaded_count >= 2
 * 
 * ================================================================
 * POSSIBLE REASONS FOR ALL PARTIAL:
 * ================================================================
 * 
 * 1. Users only uploaded Invoice PDFs (1/3 or 1/2)
 *    → Still need to upload Bukti Bayar (+ Faktur Pajak for PPN)
 * 
 * 2. Bulk upload process not complete yet
 *    → Files still being processed
 * 
 * 3. Upload order matters
 *    → PDF uploaded first, other files coming soon
 * 
 * ================================================================
 */

