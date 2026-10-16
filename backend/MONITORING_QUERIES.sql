/**
 * ================================================================
 * MONITORING QUERIES - For Bulk Upload Progress
 * ================================================================
 * 
 * Copy-paste ready queries untuk monitor upload progress
 * 
 * ================================================================
 */

-- ================================================================
-- QUERY 1: Real-time Upload Progress (FIXED)
-- ================================================================
-- Monitor status distribution untuk upload yang baru

SELECT 
    CASE 
        WHEN files_uploaded_count >= files_required_count THEN '✅ COMPLETE'
        WHEN files_uploaded_count > 0 THEN '⚠️ PARTIAL'
        ELSE '❌ EMPTY'
    END as status,
    COUNT(*) as count,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM invoice_file_list
WHERE updated_at >= NOW() - INTERVAL '1 hour'
GROUP BY 
    CASE 
        WHEN files_uploaded_count >= files_required_count THEN '✅ COMPLETE'
        WHEN files_uploaded_count > 0 THEN '⚠️ PARTIAL'
        ELSE '❌ EMPTY'
    END
ORDER BY status;

-- ================================================================
-- QUERY 2: Simple Count by Status
-- ================================================================
-- Lebih sederhana, hanya count per status

WITH status_counts AS (
    SELECT 
        files_uploaded_count,
        files_required_count,
        COUNT(*) as invoice_count
    FROM invoice_file_list
    WHERE updated_at >= NOW() - INTERVAL '1 hour'
    GROUP BY files_uploaded_count, files_required_count
)
SELECT 
    CASE 
        WHEN files_uploaded_count >= files_required_count THEN '✅ COMPLETE'
        WHEN files_uploaded_count > 0 THEN '⚠️ PARTIAL'
        ELSE '❌ EMPTY'
    END as status,
    SUM(invoice_count) as count
FROM status_counts
GROUP BY 
    CASE 
        WHEN files_uploaded_count >= files_required_count THEN '✅ COMPLETE'
        WHEN files_uploaded_count > 0 THEN '⚠️ PARTIAL'
        ELSE '❌ EMPTY'
    END
ORDER BY status;

-- ================================================================
-- QUERY 3: Detailed List (Last 50 Updates)
-- ================================================================
-- Show detail invoices yang baru di-update

SELECT 
    faktur,
    toko,
    files_uploaded_count || '/' || files_required_count as progress,
    CASE 
        WHEN files_uploaded_count >= files_required_count THEN '✅ COMPLETE'
        WHEN files_uploaded_count > 0 THEN '⚠️ PARTIAL'
        ELSE '❌ EMPTY'
    END as status,
    updated_at,
    NOW() - updated_at as time_ago
FROM invoice_file_list
WHERE updated_at >= NOW() - INTERVAL '1 hour'
ORDER BY updated_at DESC
LIMIT 50;

-- ================================================================
-- QUERY 4: Summary Stats
-- ================================================================
-- Quick summary untuk hari ini

SELECT 
    'Total Invoices Today' as metric,
    COUNT(*)::TEXT as value
FROM invoice_file_list
WHERE DATE(updated_at) = CURRENT_DATE

UNION ALL

SELECT 
    'With Files',
    COUNT(*)::TEXT
FROM invoice_file_list
WHERE DATE(updated_at) = CURRENT_DATE
  AND files_uploaded_count > 0

UNION ALL

SELECT 
    'Complete (3/3 or 2/2)',
    COUNT(*)::TEXT
FROM invoice_file_list
WHERE DATE(updated_at) = CURRENT_DATE
  AND files_uploaded_count >= files_required_count

UNION ALL

SELECT 
    'Partial (1/3, 2/3, 1/2)',
    COUNT(*)::TEXT
FROM invoice_file_list
WHERE DATE(updated_at) = CURRENT_DATE
  AND files_uploaded_count > 0
  AND files_uploaded_count < files_required_count

UNION ALL

SELECT 
    'Empty (0)',
    COUNT(*)::TEXT
FROM invoice_file_list
WHERE DATE(updated_at) = CURRENT_DATE
  AND files_uploaded_count = 0;

-- ================================================================
-- QUERY 5: Upload Rate (Files per Minute)
-- ================================================================
-- Monitor kecepatan upload

SELECT 
    DATE_TRUNC('minute', updated_at) as minute,
    COUNT(*) as files_updated,
    SUM(COUNT(*)) OVER (ORDER BY DATE_TRUNC('minute', updated_at)) as cumulative_total
FROM invoice_file_list
WHERE updated_at >= NOW() - INTERVAL '1 hour'
  AND files_uploaded_count > 0
GROUP BY DATE_TRUNC('minute', updated_at)
ORDER BY minute DESC
LIMIT 10;

-- ================================================================
-- QUERY 6: Check Specific Faktur
-- ================================================================
-- Debug specific invoice

-- Ganti 'YOUR_FAKTUR' dengan faktur yang mau di-check
SELECT 
    'invoice_file_list' as source,
    faktur,
    files_uploaded_count,
    files_required_count,
    invoice_pdf_path IS NOT NULL as has_invoice,
    bukti_bayar_path IS NOT NULL as has_bukti,
    faktur_pajak_path IS NOT NULL as has_pajak,
    updated_at
FROM invoice_file_list
WHERE faktur = 'YOUR_FAKTUR'

UNION ALL

SELECT 
    'invoice_files' as source,
    faktur,
    COUNT(*)::INTEGER as files_uploaded_count,
    NULL as files_required_count,
    BOOL_OR(file_type = 'invoice') as has_invoice,
    BOOL_OR(file_type = 'bukti_bayar') as has_bukti,
    BOOL_OR(file_type = 'faktur_pajak') as has_pajak,
    MAX(uploaded_at) as updated_at
FROM invoice_files
WHERE faktur = 'YOUR_FAKTUR'
GROUP BY faktur;

-- ================================================================
-- QUERY 7: Find Mismatches (Troubleshooting)
-- ================================================================
-- Cari invoices dimana count tidak match

SELECT 
    ifl.faktur,
    ifl.files_uploaded_count as count_in_list,
    COUNT(DISTINCT ifx.file_type) as count_in_files,
    ABS(ifl.files_uploaded_count - COUNT(DISTINCT ifx.file_type)) as diff,
    CASE 
        WHEN ifl.files_uploaded_count = COUNT(DISTINCT ifx.file_type) THEN '✅ OK'
        WHEN ifl.files_uploaded_count < COUNT(DISTINCT ifx.file_type) THEN '❌ UNDERCOUNT'
        WHEN ifl.files_uploaded_count > COUNT(DISTINCT ifx.file_type) THEN '❌ OVERCOUNT'
    END as status,
    ifl.updated_at
FROM invoice_file_list ifl
LEFT JOIN invoice_files ifx ON ifx.faktur = ifl.faktur
WHERE ifl.updated_at >= NOW() - INTERVAL '1 hour'
GROUP BY ifl.faktur, ifl.files_uploaded_count, ifl.updated_at
HAVING ifl.files_uploaded_count != COALESCE(COUNT(DISTINCT ifx.file_type), 0)
ORDER BY diff DESC, ifl.updated_at DESC
LIMIT 20;

-- ================================================================
-- QUERY 8: Last 10 Trigger Executions (if logging enabled)
-- ================================================================
-- Check jika trigger bekerja

SELECT 
    faktur,
    files_uploaded_count,
    updated_at,
    NOW() - updated_at as seconds_ago
FROM invoice_file_list
WHERE updated_at >= NOW() - INTERVAL '5 minutes'
  AND files_uploaded_count > 0
ORDER BY updated_at DESC
LIMIT 10;

/**
 * ================================================================
 * USAGE TIPS:
 * ================================================================
 * 
 * 1. Gunakan QUERY 1 atau 2 untuk monitor progress bulk upload
 *    → Run setiap 1-2 menit
 * 
 * 2. Gunakan QUERY 3 untuk see detail invoices
 *    → Lihat faktur mana yang baru di-update
 * 
 * 3. Gunakan QUERY 4 untuk daily summary
 *    → Quick overview berapa yang sudah complete
 * 
 * 4. Gunakan QUERY 7 jika ada masalah
 *    → Find mismatches between tables
 * 
 * ================================================================
 */

