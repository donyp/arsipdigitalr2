/**
 * ================================================================
 * ADVANCED FILE STATUS SYNCHRONIZATION (FIXED)
 * ================================================================
 * 
 * Script lanjutan untuk handle berbagai skenario sync
 * Kolom yang benar: invoice_pdf_path, bukti_bayar_path, faktur_pajak_path
 * 
 * ================================================================
 * OPTION 1: SAFE SYNC (RECOMMENDED)
 * ================================================================
 */

UPDATE invoice_file_list ifl
SET 
    files_uploaded_count = COALESCE((
        SELECT COUNT(DISTINCT file_type)
        FROM invoice_files ifx
        WHERE ifx.faktur = ifl.faktur
    ), 0),
    invoice_pdf_path = (
        SELECT file_path
        FROM invoice_files ifx
        WHERE ifx.faktur = ifl.faktur AND ifx.file_type = 'invoice'
        ORDER BY ifx.uploaded_at DESC LIMIT 1
    ),
    bukti_bayar_path = (
        SELECT file_path
        FROM invoice_files ifx
        WHERE ifx.faktur = ifl.faktur AND ifx.file_type = 'bukti_bayar'
        ORDER BY ifx.uploaded_at DESC LIMIT 1
    ),
    faktur_pajak_path = (
        SELECT file_path
        FROM invoice_files ifx
        WHERE ifx.faktur = ifl.faktur AND ifx.file_type = 'faktur_pajak'
        ORDER BY ifx.uploaded_at DESC LIMIT 1
    ),
    invoice_uploaded_at = (
        SELECT MAX(uploaded_at)
        FROM invoice_files ifx
        WHERE ifx.faktur = ifl.faktur AND ifx.file_type = 'invoice'
    ),
    bukti_bayar_uploaded_at = (
        SELECT MAX(uploaded_at)
        FROM invoice_files ifx
        WHERE ifx.faktur = ifl.faktur AND ifx.file_type = 'bukti_bayar'
    ),
    faktur_pajak_uploaded_at = (
        SELECT MAX(uploaded_at)
        FROM invoice_files ifx
        WHERE ifx.faktur = ifl.faktur AND ifx.file_type = 'faktur_pajak'
    )
WHERE EXISTS (
    SELECT 1 FROM invoice_files ifx WHERE ifx.faktur = ifl.faktur
);

-- ================================================================
-- OPTION 2: SYNC BY DATE RANGE
-- ================================================================
-- Ubah date range sesuai kebutuhan

UPDATE invoice_file_list ifl
SET 
    files_uploaded_count = COALESCE((
        SELECT COUNT(DISTINCT file_type) FROM invoice_files ifx 
        WHERE ifx.faktur = ifl.faktur
          AND ifx.uploaded_at >= '2026-10-10'::DATE
          AND ifx.uploaded_at < '2026-10-16'::DATE
    ), 0),
    invoice_pdf_path = (SELECT file_path FROM invoice_files ifx 
        WHERE ifx.faktur = ifl.faktur AND ifx.file_type = 'invoice'
          AND ifx.uploaded_at >= '2026-10-10'::DATE
          AND ifx.uploaded_at < '2026-10-16'::DATE
        ORDER BY ifx.uploaded_at DESC LIMIT 1),
    bukti_bayar_path = (SELECT file_path FROM invoice_files ifx 
        WHERE ifx.faktur = ifl.faktur AND ifx.file_type = 'bukti_bayar'
          AND ifx.uploaded_at >= '2026-10-10'::DATE
          AND ifx.uploaded_at < '2026-10-16'::DATE
        ORDER BY ifx.uploaded_at DESC LIMIT 1),
    faktur_pajak_path = (SELECT file_path FROM invoice_files ifx 
        WHERE ifx.faktur = ifl.faktur AND ifx.file_type = 'faktur_pajak'
          AND ifx.uploaded_at >= '2026-10-10'::DATE
          AND ifx.uploaded_at < '2026-10-16'::DATE
        ORDER BY ifx.uploaded_at DESC LIMIT 1)
WHERE ifl.tanggal >= '2026-10-10'::DATE 
  AND ifl.tanggal < '2026-10-16'::DATE
  AND EXISTS (
    SELECT 1 FROM invoice_files ifx 
    WHERE ifx.faktur = ifl.faktur
      AND ifx.uploaded_at >= '2026-10-10'::DATE
      AND ifx.uploaded_at < '2026-10-16'::DATE
  );

-- ================================================================
-- OPTION 3: SYNC BY TOKO
-- ================================================================

UPDATE invoice_file_list ifl
SET 
    files_uploaded_count = COALESCE((
        SELECT COUNT(DISTINCT file_type)
        FROM invoice_files ifx
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
-- VERIFICATION
-- ================================================================

SELECT 
    COUNT(*) as total_invoices,
    SUM(files_uploaded_count) as total_files,
    COUNT(CASE WHEN files_uploaded_count > 0 THEN 1 END) as with_files
FROM invoice_file_list;

SELECT faktur, toko, files_uploaded_count, files_required_count 
FROM invoice_file_list 
WHERE files_uploaded_count > 0 
ORDER BY faktur LIMIT 20;

