-- Fix file count for faktur 835101800030226001 to 0/2
-- This invoice should have no files uploaded

-- First, check current status
SELECT 
    faktur,
    invoice_pdf_path,
    bukti_bayar_path,
    faktur_pajak_path,
    files_uploaded_count,
    files_required_count
FROM invoice_file_list
WHERE faktur = '835101800030226001';

-- Clear all file paths and reset count to 0
UPDATE invoice_file_list
SET 
    invoice_pdf_path = NULL,
    invoice_uploaded_at = NULL,
    bukti_bayar_path = NULL,
    bukti_bayar_uploaded_at = NULL,
    faktur_pajak_path = NULL,
    faktur_pajak_uploaded_at = NULL,
    files_uploaded_count = 0,
    updated_at = NOW()
WHERE faktur = '835101800030226001';

-- Verify the update
SELECT 
    faktur,
    invoice_pdf_path,
    bukti_bayar_path,
    faktur_pajak_path,
    files_uploaded_count,
    files_required_count,
    updated_at
FROM invoice_file_list
WHERE faktur = '835101800030226001';
