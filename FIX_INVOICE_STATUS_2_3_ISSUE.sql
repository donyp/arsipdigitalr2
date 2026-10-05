-- ============================================
-- FIX: Invoice Status 2/3 Should Be 1/3
-- Faktur: 835100311010926025 (PPN)
-- ============================================
-- Problem: Database shows 2/3 files but only 1 file (PPN) exists in R2
-- Solution: Clear stale file paths, set correct count to 1/3
-- 
-- Current State:
--   - invoice_pdf_path: Likely stale (points to file that doesn't exist)
--   - bukti_bayar_path: Likely stale (points to file that doesn't exist)  
--   - faktur_pajak_path: ✓ Valid (1.53 MB file exists in R2)
--   - files_uploaded_count: 2 (WRONG - should be 1)
--   - Status: Shows 2/3 (WRONG - shows Belum Lunas with 2 files, but only 1 exists)
--
-- After Fix:
--   - All stale paths cleared
--   - files_uploaded_count: 1 (Correct - only PPN file exists)
--   - Status: 1/3 (Correct)
--   - User can re-upload Invoice PDF + Bukti Bayar to complete to 3/3

-- Clear stale paths and fix count
UPDATE invoice_file_list
SET
    invoice_pdf_path = NULL,
    bukti_bayar_path = NULL,
    faktur_pajak_path = NULL,
    files_uploaded_count = 1,      -- Only 1 file exists in R2 (PPN)
    files_required_count = 3        -- PPN requires 3 files
WHERE faktur = '835100311010926025';

-- Verify the fix
SELECT 
    faktur,
    keterangan,
    files_uploaded_count || '/' || files_required_count as status,
    CASE 
        WHEN invoice_pdf_path IS NOT NULL THEN 'Invoice PDF: ✓' 
        ELSE 'Invoice PDF: ✗'
    END as invoice_status,
    CASE 
        WHEN bukti_bayar_path IS NOT NULL THEN 'Bukti Bayar: ✓' 
        ELSE 'Bukti Bayar: ✗'
    END as bukti_status,
    CASE 
        WHEN faktur_pajak_path IS NOT NULL THEN 'Faktur Pajak: ✓' 
        ELSE 'Faktur Pajak: ✗'
    END as pajak_status
FROM invoice_file_list
WHERE faktur = '835100311010926025';
