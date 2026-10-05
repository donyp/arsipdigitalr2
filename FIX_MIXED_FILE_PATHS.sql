-- ============================================
-- FIX: Database paths are mixed/wrong
-- Faktur: 835100311010926025 (PPN) 
-- ============================================
-- Problem discovered from logs:
--   User uploaded Invoice PDF → saved to R2 as: ARSIP/BEKASI/PPN/2026/SEPTEMBER/01/835100311010926025.pdf ✓
--   But database has: invoice_pdf_path = ARSIP/BEKASI/bukti-bayar/2026/SEPTEMBER/01/835100311010926025.pdf ❌
--
-- Result:
--   - Download Invoice → retrieves wrong path (bukti-bayar) → file not found ❌
--   - Download Faktur Pajak → retrieves PPN path → works ✓ (but shouldn't - hasn't been uploaded)
--
-- Root cause: Paths got mixed during upload or previous data fix
--
-- Solution: 
--   User has uploaded 1 PPN file. Correct paths to:
--   - invoice_pdf_path: ARSIP/BEKASI/PPN/2026/SEPTEMBER/01/835100311010926025.pdf (user just uploaded this)
--   - bukti_bayar_path: NULL (not uploaded yet)
--   - faktur_pajak_path: NULL (was mistakenly set before)
--   - files_uploaded_count: 1 (only invoice PDF)

UPDATE invoice_file_list
SET
    invoice_pdf_path = 'ARSIP/BEKASI/PPN/2026/SEPTEMBER/01/835100311010926025.pdf',
    bukti_bayar_path = NULL,
    faktur_pajak_path = NULL,
    files_uploaded_count = 1,
    files_required_count = 3
WHERE faktur = '835100311010926025';

-- Verify
SELECT 
    faktur,
    keterangan,
    files_uploaded_count || '/' || files_required_count as status,
    'Invoice: ' || CASE WHEN invoice_pdf_path IS NOT NULL THEN '✓' ELSE '✗' END as invoice,
    'Bukti: ' || CASE WHEN bukti_bayar_path IS NOT NULL THEN '✓' ELSE '✗' END as bukti,
    'PPN: ' || CASE WHEN faktur_pajak_path IS NOT NULL THEN '✓' ELSE '✗' END as ppn,
    invoice_pdf_path,
    bukti_bayar_path,
    faktur_pajak_path
FROM invoice_file_list
WHERE faktur = '835100311010926025';
