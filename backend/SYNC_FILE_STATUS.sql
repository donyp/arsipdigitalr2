/**
 * ================================================================
 * FILE STATUS SYNCHRONIZATION SCRIPT
 * ================================================================
 * 
 * Sinkronisasi status file upload dari tabel invoice_files ke 
 * invoice_file_list. Gunakan script ini ketika:
 * 
 * 1. Upload PDF bulk (ratusan file) tapi hanya beberapa status yang 
 *    berubah di invoice_file_list
 * 2. Data di invoice_files dan invoice_file_list tidak sinkron
 * 3. Perlu update kolom file path dari R2 storage
 * 
 * ================================================================
 * STEP 1: CHECK CURRENT STATUS BEFORE SYNC
 * ================================================================
 */

-- Lihat status sebelum sinkronisasi
SELECT 
    'BEFORE SYNC' as sync_status,
    COUNT(DISTINCT faktur) as total_invoices,
    SUM(CASE WHEN files_uploaded_count > 0 THEN 1 ELSE 0 END) as invoices_with_files,
    SUM(CASE WHEN files_uploaded_count = 0 THEN 1 ELSE 0 END) as invoices_without_files,
    SUM(files_uploaded_count) as total_files_uploaded,
    AVG(files_uploaded_count::NUMERIC)::NUMERIC(5,2) as avg_files_per_invoice
FROM invoice_file_list;

-- Detail invoices dengan files
SELECT 
    faktur,
    files_uploaded_count,
    files_required_count,
    invoice_path,
    bukti_bayar_path,
    faktur_pajak_path
FROM invoice_file_list
WHERE files_uploaded_count > 0
ORDER BY faktur
LIMIT 20;

-- ================================================================
-- STEP 2: SYNC - UPDATE files_uploaded_count & file paths
-- ================================================================

-- UPDATE invoice_file_list dengan count dari invoice_files
UPDATE invoice_file_list ifl
SET 
    files_uploaded_count = (
        SELECT COUNT(DISTINCT file_type)
        FROM invoice_files ifx
        WHERE ifx.faktur = ifl.faktur
    ),
    -- Update file paths dari invoice_files
    invoice_pdf_path = (
        SELECT file_path
        FROM invoice_files ifx
        WHERE ifx.faktur = ifl.faktur 
          AND ifx.file_type = 'invoice'
        LIMIT 1
    ),
    bukti_bayar_path = (
        SELECT file_path
        FROM invoice_files ifx
        WHERE ifx.faktur = ifl.faktur 
          AND ifx.file_type = 'bukti_bayar'
        LIMIT 1
    ),
    faktur_pajak_path = (
        SELECT file_path
        FROM invoice_files ifx
        WHERE ifx.faktur = ifl.faktur 
          AND ifx.file_type = 'faktur_pajak'
        LIMIT 1
    ),
    invoice_uploaded_at = (
        SELECT uploaded_at
        FROM invoice_files ifx
        WHERE ifx.faktur = ifl.faktur 
          AND ifx.file_type = 'invoice'
        LIMIT 1
    ),
    bukti_bayar_uploaded_at = (
        SELECT uploaded_at
        FROM invoice_files ifx
        WHERE ifx.faktur = ifl.faktur 
          AND ifx.file_type = 'bukti_bayar'
        LIMIT 1
    ),
    faktur_pajak_uploaded_at = (
        SELECT uploaded_at
        FROM invoice_files ifx
        WHERE ifx.faktur = ifl.faktur 
          AND ifx.file_type = 'faktur_pajak'
        LIMIT 1
    )
WHERE EXISTS (
    SELECT 1
    FROM invoice_files ifx
    WHERE ifx.faktur = ifl.faktur
);

-- Tampilkan hasil sinkronisasi
SELECT 
    'AFTER SYNC' as sync_status,
    COUNT(DISTINCT faktur) as total_invoices,
    SUM(CASE WHEN files_uploaded_count > 0 THEN 1 ELSE 0 END) as invoices_with_files,
    SUM(CASE WHEN files_uploaded_count = 0 THEN 1 ELSE 0 END) as invoices_without_files,
    SUM(files_uploaded_count) as total_files_uploaded,
    AVG(files_uploaded_count::NUMERIC)::NUMERIC(5,2) as avg_files_per_invoice
FROM invoice_file_list;

-- ================================================================
-- STEP 3: VERIFY SYNC RESULTS
-- ================================================================

-- Lihat invoices yang berhasil di-update
SELECT 
    faktur,
    files_uploaded_count,
    invoice_path,
    bukti_bayar_path,
    faktur_pajak_path,
    CASE 
        WHEN files_uploaded_count = files_required_count THEN '✅ LENGKAP'
        WHEN files_uploaded_count > 0 THEN '⚠️ PARTIAL'
        ELSE '❌ KOSONG'
    END as status
FROM invoice_file_list
ORDER BY files_uploaded_count DESC, faktur
LIMIT 50;

-- ================================================================
-- STEP 4: DETAILED SYNC REPORT
-- ================================================================

WITH sync_report AS (
    SELECT 
        ifl.faktur,
        ifl.toko,
        ifl.tanggal,
        ifl.files_uploaded_count,
        ifl.files_required_count,
        COUNT(ifx.id) as files_in_invoice_files,
        STRING_AGG(DISTINCT ifx.file_type, ', ' ORDER BY ifx.file_type) as file_types,
        MAX(ifx.uploaded_at) as latest_upload
    FROM invoice_file_list ifl
    LEFT JOIN invoice_files ifx ON ifx.faktur = ifl.faktur
    GROUP BY ifl.faktur, ifl.toko, ifl.tanggal, ifl.files_uploaded_count, ifl.files_required_count
    ORDER BY ifl.faktur
)
SELECT 
    faktur,
    toko,
    tanggal,
    files_uploaded_count,
    files_required_count,
    files_in_invoice_files,
    file_types,
    latest_upload,
    CASE 
        WHEN files_uploaded_count = files_required_count THEN 'LENGKAP ✅'
        WHEN files_uploaded_count > 0 THEN 'PARTIAL ⚠️'
        WHEN files_in_invoice_files > 0 THEN 'MISMATCH ❌'
        ELSE 'KOSONG'
    END as status,
    CASE 
        WHEN files_in_invoice_files > files_uploaded_count THEN 'OUT OF SYNC'
        WHEN files_in_invoice_files < files_uploaded_count THEN 'ERROR'
        ELSE 'OK'
    END as sync_status
FROM sync_report
ORDER BY sync_status DESC, tanggal DESC
LIMIT 100;

-- ================================================================
-- STEP 5: COUNT SUMMARY BY STATUS
-- ================================================================

SELECT 
    CASE 
        WHEN files_uploaded_count = files_required_count THEN 'LENGKAP ✅'
        WHEN files_uploaded_count > 0 THEN 'PARTIAL ⚠️'
        ELSE 'KOSONG'
    END as status,
    COUNT(*) as count,
    SUM(files_uploaded_count) as total_files,
    ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM invoice_file_list), 2) as percentage
FROM invoice_file_list
GROUP BY status
ORDER BY count DESC;

-- ================================================================
-- ADDITIONAL QUERIES
-- ================================================================

-- Invoices yang ada di invoice_files tapi tidak ada di invoice_file_list
-- (Jika ada, ini berarti ada masalah dengan data)
SELECT 
    faktur,
    COUNT(*) as count,
    STRING_AGG(DISTINCT file_type, ', ') as file_types
FROM invoice_files ifx
WHERE NOT EXISTS (
    SELECT 1 
    FROM invoice_file_list ifl 
    WHERE ifl.faktur = ifx.faktur
)
GROUP BY faktur;

