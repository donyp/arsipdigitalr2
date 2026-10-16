-- ============================================================
-- WhatsApp Zona Groups Configuration
-- Stores WhatsApp group IDs for each zona
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_zona_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zona_id UUID NOT NULL UNIQUE REFERENCES zonas(id) ON DELETE CASCADE,
    group_id VARCHAR(255) NOT NULL UNIQUE COMMENT 'WhatsApp group ID format: 120xxxxx@g.us',
    group_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================
-- Table untuk track pesan yang dikirim per zona
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_zona_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zona_id UUID NOT NULL REFERENCES zonas(id) ON DELETE CASCADE,
    group_id VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'notification' COMMENT 'notification, manual_send, auto_trigger',
    trigger_source VARCHAR(100) COMMENT 'invoice_upload, manual_send, etc',
    sent_at TIMESTAMP WITH TIME ZONE,
    sent_by_user_id UUID REFERENCES users(id),
    queue_status VARCHAR(50) DEFAULT 'pending' COMMENT 'pending, queued, sent, failed',
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================
-- Indexes untuk performance
-- ============================================================

CREATE INDEX idx_whatsapp_zona_groups_zona_id ON whatsapp_zona_groups(zona_id);
CREATE INDEX idx_whatsapp_zona_groups_active ON whatsapp_zona_groups(is_active);
CREATE INDEX idx_whatsapp_zona_messages_zona_id ON whatsapp_zona_messages(zona_id);
CREATE INDEX idx_whatsapp_zona_messages_sent_at ON whatsapp_zona_messages(sent_at);
CREATE INDEX idx_whatsapp_zona_messages_created_at ON whatsapp_zona_messages(created_at DESC);

-- ============================================================
-- Enable audit logging
-- ============================================================

ALTER TABLE whatsapp_zona_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_zona_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Sample data (optional - untuk testing)
-- ============================================================

-- Uncomment untuk test:
-- INSERT INTO whatsapp_zona_groups (zona_id, group_id, group_name)
-- SELECT id, '120xxxxx@g.us', 'Group-' || nama 
-- FROM zonas 
-- ON CONFLICT (zona_id) DO NOTHING;
