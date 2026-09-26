-- Migrate file paths from Google Drive format to R2 format
-- This updates the invoice_file_list table with correct R2 paths

UPDATE invoice_file_list
SET 
  -- Migrate invoice paths: ARSIPINVOICE/LOCATION/YYYY/MM/DD/CATEGORY/ -> ARSIP/LOCATION/CATEGORY/YYYY/MM/DD/
  invoice_pdf_path = CASE 
    WHEN invoice_pdf_path LIKE 'ARSIPINVOICE/BEKASI/%' THEN
      CONCAT(
        'ARSIP/BEKASI/',
        COALESCE(
          CASE 
            WHEN invoice_pdf_path LIKE '%/PPN/%' THEN 'PPN/'
            WHEN invoice_pdf_path LIKE '%/NON/%' THEN 'NON/'
            ELSE 'PPN/'
          END,
          'PPN/'
        ),
        REGEXP_SUBSTR(invoice_pdf_path, '/([0-9]{4})/'),
        REGEXP_SUBSTR(invoice_pdf_path, '/([A-Z]+)/[0-9]{4}/'),
        REGEXP_SUBSTR(invoice_pdf_path, '/([0-9]{2})/[A-Z]+/'),
        REGEXP_SUBSTR(invoice_pdf_path, '[^/]+\.pdf$')
      )
    ELSE invoice_pdf_path
  END,
  
  -- Migrate bukti bayar paths
  bukti_bayar_path = CASE 
    WHEN bukti_bayar_path LIKE 'ARSIPINVOICE/BEKASI/%BUKTIBAYAR%' THEN
      CONCAT(
        'ARSIP/BEKASI/bukti-bayar/',
        REGEXP_SUBSTR(bukti_bayar_path, '/([0-9]{4})/'),
        REGEXP_SUBSTR(bukti_bayar_path, '/([A-Z]+)/[0-9]{4}/'),
        REGEXP_SUBSTR(bukti_bayar_path, '/([0-9]{2})/[A-Z]+/'),
        REGEXP_SUBSTR(bukti_bayar_path, '[^/]+\.pdf$')
      )
    ELSE bukti_bayar_path
  END,
  
  -- Migrate faktur pajak paths (already in correct format mostly)
  faktur_pajak_path = CASE 
    WHEN faktur_pajak_path LIKE 'ARSIP/BEKASI/Faktur-Pajak/%' THEN faktur_pajak_path
    ELSE faktur_pajak_path
  END,
  
  updated_at = NOW()
WHERE faktur IS NOT NULL;

-- Show updated rows
SELECT faktur, invoice_pdf_path, bukti_bayar_path, faktur_pajak_path
FROM invoice_file_list
WHERE faktur = '835100311020926004'
LIMIT 1;
