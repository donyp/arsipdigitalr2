-- ========================================================================
-- Migration: Add separate columns for tracking multiple file uploads
-- ========================================================================
-- Add three separate columns to invoice_file_list to track:
-- 1. invoice_pdf_path - Invoice PDF file path
-- 2. bukti_bayar_path - Bukti Bayar (Payment Proof) file path  
-- 3. faktur_pajak_path - Faktur Pajak (Tax Invoice) file path
--
-- Previously: uploaded_file_path tracked only ONE file (now renamed to invoice_pdf_path)
-- ========================================================================

-- Step 1: Add new columns if they don't exist
ALTER TABLE invoice_file_list 
ADD COLUMN IF NOT EXISTS bukti_bayar_path TEXT,
ADD COLUMN IF NOT EXISTS faktur_pajak_path TEXT;

-- Step 2: Rename uploaded_file_path to invoice_pdf_path (for clarity)
-- Note: In Postgres, renaming columns requires dropping constraints, so we'll create new column and migrate data
ALTER TABLE invoice_file_list
ADD COLUMN IF NOT EXISTS invoice_pdf_path TEXT;

-- Step 3: Copy existing uploaded_file_path data to invoice_pdf_path
UPDATE invoice_file_list 
SET invoice_pdf_path = uploaded_file_path 
WHERE invoice_pdf_path IS NULL AND uploaded_file_path IS NOT NULL;

-- Step 4: Optional - keep uploaded_file_path for backward compatibility (for now)
-- Users can still query uploaded_file_path, it will show invoice PDF path
-- Later we can drop it after confirming all code uses invoice_pdf_path

-- Step 5: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_invoice_file_list_bukti_bayar_path ON invoice_file_list(bukti_bayar_path);
CREATE INDEX IF NOT EXISTS idx_invoice_file_list_faktur_pajak_path ON invoice_file_list(faktur_pajak_path);
CREATE INDEX IF NOT EXISTS idx_invoice_file_list_invoice_pdf_path ON invoice_file_list(invoice_pdf_path);

-- Step 6: Add comments for clarity
COMMENT ON COLUMN invoice_file_list.invoice_pdf_path IS 'Path to uploaded invoice PDF in R2 storage (ARSIP/LOCATION/PPN|NON/YEAR/MONTH/DAY/filename)';
COMMENT ON COLUMN invoice_file_list.bukti_bayar_path IS 'Path to bukti bayar (payment proof) PDF in R2 storage (ARSIP/LOCATION/bukti-bayar/YEAR/MONTH/DAY/filename)';
COMMENT ON COLUMN invoice_file_list.faktur_pajak_path IS 'Path to faktur pajak (tax invoice) PDF in R2 storage (ARSIP/LOCATION/Faktur-Pajak/YEAR/MONTH/DAY/filename)';

-- Step 7: Verify migration
SELECT 
    COUNT(*) as total_invoices,
    COUNT(invoice_pdf_path) as with_pdf,
    COUNT(bukti_bayar_path) as with_bukti_bayar,
    COUNT(faktur_pajak_path) as with_faktur_pajak
FROM invoice_file_list;
