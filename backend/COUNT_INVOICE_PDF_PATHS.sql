/**
 * Simple count query - berapa invoice yang sudah ada PDF path
 */

-- Total invoice dengan PDF
SELECT COUNT(DISTINCT faktur) as total_invoice_dengan_pdf
FROM invoice_files
WHERE file_type = 'invoice';

-- Total invoice dengan bukti bayar
SELECT COUNT(DISTINCT faktur) as total_invoice_dengan_bukti_bayar
FROM invoice_files
WHERE file_type = 'bukti_bayar';

-- Total invoice dengan faktur pajak
SELECT COUNT(DISTINCT faktur) as total_invoice_dengan_faktur_pajak
FROM invoice_files
WHERE file_type = 'faktur_pajak';

-- Total invoice keseluruhan
SELECT COUNT(DISTINCT faktur) as total_invoice_keseluruhan
FROM invoice_files;

-- Breakdown lengkap
SELECT 
    'PDF Invoice' as tipe_file,
    COUNT(DISTINCT faktur) as jumlah
FROM invoice_files
WHERE file_type = 'invoice'
UNION ALL
SELECT 
    'Bukti Bayar',
    COUNT(DISTINCT faktur)
FROM invoice_files
WHERE file_type = 'bukti_bayar'
UNION ALL
SELECT 
    'Faktur Pajak',
    COUNT(DISTINCT faktur)
FROM invoice_files
WHERE file_type = 'faktur_pajak'
ORDER BY jumlah DESC;
