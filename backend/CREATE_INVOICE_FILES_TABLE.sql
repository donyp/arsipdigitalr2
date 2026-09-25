-- Create invoice_files table to track individual file uploads
-- This allows us to store multiple files per invoice (PDF, bukti bayar, faktur pajak)
-- without modifying the existing invoice_file_list schema
--
-- NOTE: No foreign key constraint because invoice_file_list.faktur doesn't have
-- an explicit UNIQUE constraint (even though values are unique). PostgreSQL requires
-- explicit UNIQUE or PRIMARY KEY to create a foreign key reference.

CREATE TABLE IF NOT EXISTS invoice_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faktur VARCHAR(50) NOT NULL,
    file_type VARCHAR(50) NOT NULL CHECK (file_type IN ('invoice', 'bukti_bayar', 'faktur_pajak')),
    file_path TEXT NOT NULL,
    file_size BIGINT,
    uploaded_by UUID,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one file per type per invoice (prevent duplicates)
    UNIQUE(faktur, file_type)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_invoice_files_faktur ON invoice_files(faktur);
CREATE INDEX IF NOT EXISTS idx_invoice_files_file_type ON invoice_files(file_type);
CREATE INDEX IF NOT EXISTS idx_invoice_files_faktur_type ON invoice_files(faktur, file_type);
CREATE INDEX IF NOT EXISTS idx_invoice_files_uploaded_at ON invoice_files(uploaded_at DESC);

-- Enable RLS if needed
ALTER TABLE invoice_files ENABLE ROW LEVEL SECURITY;

-- Add comment
COMMENT ON TABLE invoice_files IS 'Tracks individual file uploads for invoices (invoice PDF, bukti bayar, faktur pajak)';
COMMENT ON COLUMN invoice_files.faktur IS 'Foreign key to invoice_file_list.faktur';
COMMENT ON COLUMN invoice_files.file_type IS 'Type of file: invoice, bukti_bayar, or faktur_pajak';
COMMENT ON COLUMN invoice_files.file_path IS 'Path to file in R2 storage';
