-- PDF Conversion History Table
-- Stores records of PDF to CSV conversions for tracking and analytics

CREATE TABLE IF NOT EXISTS pdf_conversions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    user_email TEXT NOT NULL,
    bank TEXT NOT NULL CHECK (bank IN ('bca', 'bsi', 'muamalat')),
    original_filename TEXT NOT NULL,
    file_size INTEGER NOT NULL, -- in bytes
    page_count INTEGER,
    transaction_count INTEGER DEFAULT 0,
    csv_filename TEXT NOT NULL,
    status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failed', 'processing')),
    error_message TEXT,
    processing_time_ms INTEGER, -- processing time in milliseconds
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign key to users table
    CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_pdf_conversions_user_id ON pdf_conversions(user_id);
CREATE INDEX IF NOT EXISTS idx_pdf_conversions_created_at ON pdf_conversions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pdf_conversions_bank ON pdf_conversions(bank);
CREATE INDEX IF NOT EXISTS idx_pdf_conversions_status ON pdf_conversions(status);

-- Statistics view for admin dashboard
CREATE OR REPLACE VIEW pdf_conversion_stats AS
SELECT 
    COUNT(*) as total_conversions,
    COUNT(DISTINCT user_id) as unique_users,
    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_conversions,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_conversions,
    bank,
    DATE(created_at) as conversion_date
FROM pdf_conversions
GROUP BY bank, DATE(created_at)
ORDER BY conversion_date DESC;

COMMENT ON TABLE pdf_conversions IS 'Tracks PDF to CSV conversion history for all users';
COMMENT ON COLUMN pdf_conversions.processing_time_ms IS 'Time taken to process the PDF in milliseconds';
COMMENT ON COLUMN pdf_conversions.transaction_count IS 'Number of transactions extracted from the PDF';
