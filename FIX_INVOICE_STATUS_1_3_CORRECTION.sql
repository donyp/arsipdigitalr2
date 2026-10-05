-- ============================================
-- FIX: Restore PPN file path for faktur 835100311010926025
-- ============================================
-- Previous fix cleared ALL paths termasuk faktur pajak yang valid
-- Now we restore the faktur pajak path so R2 scan can find it
-- 
-- Current issue:
--   - files_uploaded_count: 0 (WRONG - should be 1)
--   - faktur_pajak_path: NULL (WRONG - PPN file exists in R2)
--   - db_faktur_path: ✗ (shows as missing but file exists)
--
-- Root cause:
--   Previous SQL fix set files_uploaded_count=1 but cleared faktur_pajak_path
--   So R2 scan can't find the path when scanning for files
--
-- Solution:
--   Restore the faktur pajak path so R2 scan finds 1 file correctly

UPDATE invoice_file_list
SET
    faktur_pajak_path = 'ARSIP/BEKASI/PPN/2026/SEPTEMBER/01/835100311010926025.pdf',
    files_uploaded_count = 1,
    files_required_count = 3
WHERE faktur = '835100311010926025';

-- Verify
SELECT 
    faktur,
    keterangan,
    files_uploaded_count || '/' || files_required_count as status,
    CASE WHEN invoice_pdf_path IS NOT NULL THEN 'Invoice: ✓' ELSE 'Invoice: ✗' END as invoice_status,
    CASE WHEN bukti_bayar_path IS NOT NULL THEN 'Bukti: ✓' ELSE 'Bukti: ✗' END as bukti_status,
    CASE WHEN faktur_pajak_path IS NOT NULL THEN 'PPN: ✓' ELSE 'PPN: ✗' END as ppn_status,
    faktur_pajak_path
FROM invoice_file_list
WHERE faktur = '835100311010926025';
