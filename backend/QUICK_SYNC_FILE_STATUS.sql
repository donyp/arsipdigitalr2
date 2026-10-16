/**
 * ================================================================
 * QUICK SYNC - Copy & Paste Ready (FIXED - Correct Column Names)
 * ================================================================
 * 
 * Kolom yang benar: invoice_pdf_path, bukti_bayar_path, faktur_pajak_path
 * 
 * Gunakan salah satu script dibawah ini untuk cepat mensinkronkan
 * status file upload. Pilih sesuai kebutuhan:
 * 
 * 1. QUICK_SYNC_ALL - Sync semua invoices (RECOMMENDED)
 * 2. QUICK_SYNC_TODAY - Sync hanya invoices dari hari ini
 * 3. QUICK_SYNC_TOKO - Sync hanya dari toko tertentu
 * 4. QUICK_SYNC_LAST_N_DAYS - Sync N hari terakhir
 * 
 * ================================================================
 * SCRIPT 1: QUICK SYNC ALL (COPY & PASTE)
 * ================================================================
 */

-- GUNAKAN INI UNTUK SYNC SEMUA FILE
UPDATE invoice_file_list ifl
SET 
    files_uploaded_count = COALESCE((
        SELECT COUNT(DISTINCT file_type) FROM invoice_files ifx 
        WHERE ifx.faktur = ifl.faktur
    ), 0),
    invoice_pdf_path = (SELECT file_path FROM invoice_files ifx 
        WHERE ifx.faktur = ifl.faktur AND ifx.file_type = 'invoice' 
        ORDER BY ifx.uploaded_at DESC LIMIT 1),
    bukti_bayar_path = (SELECT file_path FROM invoice_files ifx 
        WHERE ifx.faktur = ifl.faktur AND ifx.file_type = 'bukti_bayar' 
        ORDER BY ifx.uploaded_at DESC LIMIT 1),
    faktur_pajak_path = (SELECT file_path FROM invoice_files ifx 
        WHERE ifx.faktur = ifl.faktur AND ifx.file_type = 'faktur_pajak' 
        ORDER BY ifx.uploaded_at DESC LIMIT 1)
WHERE EXISTS (SELECT 1 FROM invoice_files ifx WHERE ifx.faktur = ifl.faktur);

-- VERIFY: Check hasil sync
SELECT 
    COUNT(*) as total_invoices,
    SUM(files_uploaded_count) as total_files,
    COUNT(CASE WHEN files_uploaded_count > 0 THEN 1 END) as with_files,
    COUNT(CASE WHEN files_uploaded_count = 0 THEN 1 END) as without_files
FROM invoice_file_list;

-- Show top 20 updated
SELECT faktur, toko, files_uploaded_count, files_required_count 
FROM invoice_file_list 
WHERE files_uploaded_count > 0 
ORDER BY faktur LIMIT 20;

-- ================================================================
-- SCRIPT 2: QUICK SYNC TODAY ONLY
-- ================================================================
-- Gunakan untuk sync hanya file yang di-upload HARI INI

UPDATE invoice_file_list ifl
SET 
    files_uploaded_count = COALESCE((
        SELECT COUNT(DISTINCT file_type) FROM invoice_files ifx 
        WHERE ifx.faktur = ifl.faktur
          AND DATE(ifx.uploaded_at) = CURRENT_DATE
    ), 0),
    invoice_pdf_path = (SELECT file_path FROM invoice_files ifx 
        WHERE ifx.faktur = ifl.faktur AND ifx.file_type = 'invoice'
          AND DATE(ifx.uploaded_at) = CURRENT_DATE
        ORDER BY ifx.uploaded_at DESC LIMIT 1),
    bukti_bayar_path = (SELECT file_path FROM invoice_files ifx 
        WHERE ifx.faktur = ifl.faktur AND ifx.file_type = 'bukti_bayar'
          AND DATE(ifx.uploaded_at) = CURRENT_DATE
        ORDER BY ifx.uploaded_at DESC LIMIT 1),
    faktur_pajak_path = (SELECT file_path FROM invoice_files ifx 
        WHERE ifx.faktur = ifl.faktur AND ifx.file_type = 'faktur_pajak'
          AND DATE(ifx.uploaded_at) = CURRENT_DATE
        ORDER BY ifx.uploaded_at DESC LIMIT 1)
WHERE ifl.tanggal = CURRENT_DATE
  AND EXISTS (
    SELECT 1 FROM invoice_files ifx 
    WHERE ifx.faktur = ifl.faktur 
      AND DATE(ifx.uploaded_at) = CURRENT_DATE
  );

-- ================================================================
-- SCRIPT 3: QUICK SYNC BY TOKO
-- ================================================================
-- Ubah 'ANKA BEKASI' dengan nama toko Anda

UPDATE invoice_file_list ifl
SET 
    files_uploaded_count = COALESCE((
        SELECT COUNT(DISTINCT file_type) FROM invoice_files ifx 
        WHERE ifx.faktur = ifl.faktur
    ), 0),
    invoice_pdf_path = (SELECT file_path FROM invoice_files ifx 
        WHERE ifx.faktur = ifl.faktur AND ifx.file_type = 'invoice' 
        ORDER BY ifx.uploaded_at DESC LIMIT 1),
    bukti_bayar_path = (SELECT file_path FROM invoice_files ifx 
        WHERE ifx.faktur = ifl.faktur AND ifx.file_type = 'bukti_bayar' 
        ORDER BY ifx.uploaded_at DESC LIMIT 1),
    faktur_pajak_path = (SELECT file_path FROM invoice_files ifx 
        WHERE ifx.faktur = ifl.faktur AND ifx.file_type = 'faktur_pajak' 
        ORDER BY ifx.uploaded_at DESC LIMIT 1)
WHERE ifl.toko = 'ANKA BEKASI'
  AND EXISTS (SELECT 1 FROM invoice_files ifx WHERE ifx.faktur = ifl.faktur);

-- ================================================================
-- SCRIPT 4: QUICK SYNC LAST 7 DAYS
-- ================================================================
-- Gunakan untuk sync file yang di-upload 7 hari terakhir

UPDATE invoice_file_list ifl
SET 
    files_uploaded_count = COALESCE((
        SELECT COUNT(DISTINCT file_type) FROM invoice_files ifx 
        WHERE ifx.faktur = ifl.faktur
          AND ifx.uploaded_at >= NOW() - INTERVAL '7 days'
    ), 0)
WHERE EXISTS (
    SELECT 1 FROM invoice_files ifx 
    WHERE ifx.faktur = ifl.faktur 
      AND ifx.uploaded_at >= NOW() - INTERVAL '7 days'
);

-- ================================================================
-- SCRIPT 5: FORCE RESET & RECALCULATE ALL
-- ================================================================
-- ⚠️ HATI-HATI: Gunakan ini jika data benar-benar kacau
-- Ini akan RESET semua counts ke 0, lalu recalculate dari invoice_files

BEGIN;
  UPDATE invoice_file_list SET files_uploaded_count = 0;
  
  UPDATE invoice_file_list ifl
  SET 
      files_uploaded_count = COALESCE((
          SELECT COUNT(DISTINCT file_type) FROM invoice_files ifx 
          WHERE ifx.faktur = ifl.faktur
      ), 0),
      invoice_pdf_path = (SELECT file_path FROM invoice_files ifx 
          WHERE ifx.faktur = ifl.faktur AND ifx.file_type = 'invoice' 
          ORDER BY ifx.uploaded_at DESC LIMIT 1),
      bukti_bayar_path = (SELECT file_path FROM invoice_files ifx 
          WHERE ifx.faktur = ifl.faktur AND ifx.file_type = 'bukti_bayar' 
          ORDER BY ifx.uploaded_at DESC LIMIT 1),
      faktur_pajak_path = (SELECT file_path FROM invoice_files ifx 
          WHERE ifx.faktur = ifl.faktur AND ifx.file_type = 'faktur_pajak' 
          ORDER BY ifx.uploaded_at DESC LIMIT 1)
  WHERE EXISTS (SELECT 1 FROM invoice_files ifx WHERE ifx.faktur = ifl.faktur);
COMMIT;

-- ================================================================
-- DIAGNOSTIC QUERIES - Jalankan untuk debug
-- ================================================================

-- 1. Lihat file yang ada di invoice_files tapi tidak tercounted
SELECT 
    DISTINCT(faktur),
    COUNT(*) as total_files
FROM invoice_files
GROUP BY faktur
ORDER BY COUNT(*) DESC
LIMIT 20;

-- 2. Lihat mismatch antara counted vs actual
SELECT 
    ifl.faktur,
    ifl.files_uploaded_count as counted,
    COUNT(DISTINCT ifx.file_type) as actual,
    CASE 
        WHEN ifl.files_uploaded_count < COUNT(DISTINCT ifx.file_type) THEN '❌ UNDERCOUNT'
        WHEN ifl.files_uploaded_count > COUNT(DISTINCT ifx.file_type) THEN '❌ OVERCOUNT'
        ELSE '✅ OK'
    END as status
FROM invoice_file_list ifl
LEFT JOIN invoice_files ifx ON ifx.faktur = ifl.faktur
GROUP BY ifl.faktur, ifl.files_uploaded_count
HAVING ifl.files_uploaded_count != COUNT(DISTINCT ifx.file_type)
ORDER BY faktur;

-- 3. Lihat invoices terbaru dengan file
SELECT 
    faktur,
    toko,
    files_uploaded_count,
    files_required_count,
    CASE 
        WHEN files_uploaded_count >= files_required_count THEN '✅ LENGKAP'
        WHEN files_uploaded_count > 0 THEN '⚠️ PARTIAL'
        ELSE '❌ BELUM'
    END as status
FROM invoice_file_list
WHERE files_uploaded_count > 0
ORDER BY tanggal DESC, faktur DESC
LIMIT 30;

-- 4. Summary stats
SELECT 
    'Total Invoices' as metric, COUNT(*) as value FROM invoice_file_list
UNION ALL
SELECT 'Invoices with Files', COUNT(*) FROM invoice_file_list WHERE files_uploaded_count > 0
UNION ALL
SELECT 'Total Files Uploaded', SUM(files_uploaded_count) FROM invoice_file_list
UNION ALL
SELECT 'Avg Files per Invoice', 
    ROUND(AVG(files_uploaded_count)::NUMERIC, 2)::BIGINT 
FROM invoice_file_list WHERE files_uploaded_count > 0
UNION ALL
SELECT 'Complete Invoices', 
    COUNT(*) FROM invoice_file_list 
    WHERE files_uploaded_count >= files_required_count;

