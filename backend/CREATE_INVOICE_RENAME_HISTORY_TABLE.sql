-- Create invoice_rename_history table
-- Tracks all invoice PDF rename operations with metadata
-- Used to maintain audit trail of renamed files

CREATE TABLE IF NOT EXISTS invoice_rename_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    user_role VARCHAR(50) NOT NULL,
    zona_id BIGINT,
    original_filename VARCHAR(255) NOT NULL,
    new_filename VARCHAR(255) NOT NULL,
    invoice_number VARCHAR(16) NOT NULL,
    file_size BIGINT NOT NULL,
    status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success', 'failed')),
    error_message TEXT,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_invoice_rename_history_user_id ON invoice_rename_history(user_id);
CREATE INDEX IF NOT EXISTS idx_invoice_rename_history_invoice_number ON invoice_rename_history(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoice_rename_history_zona_id ON invoice_rename_history(zona_id);
CREATE INDEX IF NOT EXISTS idx_invoice_rename_history_processed_at ON invoice_rename_history(processed_at);
