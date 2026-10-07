-- ============================================================
-- Create WhatsApp Invoice Notifications Table
-- Stores WhatsApp notifications for invoice uploads per zona
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_invoice_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zona_id BIGINT NOT NULL,
    moderator_id UUID NOT NULL,
    invoice_count BIGINT,
    invoice_details JSONB,
    message TEXT NOT NULL,
    batch_id VARCHAR(255),
    notification_type VARCHAR(50) DEFAULT 'invoice_upload',
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Foreign key constraints
    CONSTRAINT fk_zona FOREIGN KEY (zona_id) REFERENCES zonas(id) ON DELETE CASCADE
    -- Note: moderator_id foreign key removed to allow notifications to persist
    -- even if user is deleted, and to handle cases where user ID may not exist
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_zona_id ON whatsapp_invoice_notifications(zona_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_moderator_id ON whatsapp_invoice_notifications(moderator_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_batch_id ON whatsapp_invoice_notifications(batch_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notification_type ON whatsapp_invoice_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sent_at ON whatsapp_invoice_notifications(sent_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_created_at ON whatsapp_invoice_notifications(created_at DESC);

-- Enable Row Level Security (if needed in future)
ALTER TABLE whatsapp_invoice_notifications ENABLE ROW LEVEL SECURITY;

-- Set table permissions for authenticated users
GRANT ALL ON whatsapp_invoice_notifications TO authenticated;
GRANT ALL ON whatsapp_invoice_notifications TO anon;

-- Add comment for documentation
COMMENT ON TABLE whatsapp_invoice_notifications IS 'WhatsApp notifications generated from bulk invoice PDF uploads, grouped by zona';
COMMENT ON COLUMN whatsapp_invoice_notifications.zona_id IS 'Reference to the zona (area) that invoices belong to';
COMMENT ON COLUMN whatsapp_invoice_notifications.moderator_id IS 'User who uploaded the invoices';
COMMENT ON COLUMN whatsapp_invoice_notifications.invoice_count IS 'Number of invoices in this notification';
COMMENT ON COLUMN whatsapp_invoice_notifications.invoice_details IS 'JSON array of invoice objects {tipe, konsumen, nominal}';
COMMENT ON COLUMN whatsapp_invoice_notifications.message IS 'Formatted WhatsApp message content for manual copying';
COMMENT ON COLUMN whatsapp_invoice_notifications.batch_id IS 'Groups multiple notifications from the same upload session';
COMMENT ON COLUMN whatsapp_invoice_notifications.notification_type IS 'Type of notification: invoice_upload, excel_upload, etc.';
COMMENT ON COLUMN whatsapp_invoice_notifications.sent_at IS 'Timestamp when message was marked as sent; NULL if still pending';
