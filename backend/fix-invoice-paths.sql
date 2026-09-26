-- Fix file paths for invoice 835100311020926004 to match R2 storage format

UPDATE invoice_file_list
SET 
  invoice_pdf_path = 'ARSIP/BEKASI/PPN/2026/SEPTEMBER/02/835100311020926004.pdf',
  bukti_bayar_path = 'ARSIP/BEKASI/bukti-bayar/2026/SEPTEMBER/02/835100311020926004.pdf',
  faktur_pajak_path = 'ARSIP/BEKASI/Faktur-Pajak/2026/SEPTEMBER/02/tax-835100311020926004 SEMESTA GEMILANG 21.658.256.pdf',
  updated_at = NOW()
WHERE faktur = '835100311020926004';

-- Verify the update
SELECT faktur, invoice_pdf_path, bukti_bayar_path, faktur_pajak_path, files_uploaded_count, files_required_count
FROM invoice_file_list
WHERE faktur = '835100311020926004';
