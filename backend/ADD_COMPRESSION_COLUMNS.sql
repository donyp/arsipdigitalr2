-- Add compression metadata columns to invoice_files table
-- These columns track whether files were compressed and compression statistics

ALTER TABLE invoice_files 
ADD COLUMN IF NOT EXISTS was_compressed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS original_size BIGINT,
ADD COLUMN IF NOT EXISTS compressed_size BIGINT,
ADD COLUMN IF NOT EXISTS compression_note TEXT;

-- Create indexes for compression tracking
CREATE INDEX IF NOT EXISTS idx_invoice_files_was_compressed ON invoice_files(was_compressed) WHERE was_compressed = TRUE;

-- Add comment
COMMENT ON COLUMN invoice_files.was_compressed IS 'Whether the file was compressed during upload';
COMMENT ON COLUMN invoice_files.original_size IS 'Original file size in bytes before compression';
COMMENT ON COLUMN invoice_files.compressed_size IS 'Compressed file size in bytes after compression';
COMMENT ON COLUMN invoice_files.compression_note IS 'User-friendly message about compression status';
