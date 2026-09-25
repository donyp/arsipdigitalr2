-- Add file count tracking columns to invoice_file_list
-- These columns store the count of files uploaded and required for each invoice
-- Updated by updateFilesUploadedCount() function after file uploads

ALTER TABLE invoice_file_list 
ADD COLUMN IF NOT EXISTS files_uploaded_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS files_required_count INTEGER DEFAULT 2;

-- Create index for filtering by incomplete uploads
CREATE INDEX IF NOT EXISTS idx_invoice_file_list_upload_status 
ON invoice_file_list(files_uploaded_count, files_required_count)
WHERE files_uploaded_count < files_required_count;

-- Add comment
COMMENT ON COLUMN invoice_file_list.files_uploaded_count IS 'Number of files uploaded (invoice, bukti bayar, faktur pajak)';
COMMENT ON COLUMN invoice_file_list.files_required_count IS 'Number of files required (2 for NON PPN, 3 for PPN)';
