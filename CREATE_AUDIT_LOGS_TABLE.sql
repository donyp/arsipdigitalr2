-- ============================================================
-- AUDIT LOGS TABLE - Track all critical operations
-- ============================================================

-- Drop existing table if needed (safe cleanup)
DROP TABLE IF EXISTS audit_logs CASCADE;

-- Create table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    user_email VARCHAR(255),
    user_role VARCHAR(50),
    zona_id INTEGER,
    action VARCHAR(100),
    resource_type VARCHAR(50),
    resource_id VARCHAR(255),
    resource_name VARCHAR(255),
    operation VARCHAR(20),
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    request_path VARCHAR(255),
    request_method VARCHAR(10),
    status_code INTEGER,
    response_message TEXT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_suspicious BOOLEAN DEFAULT FALSE,
    severity VARCHAR(20) DEFAULT 'info'
);

-- ============================================================
-- INDEXES for fast querying
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_operation ON audit_logs(operation);
CREATE INDEX IF NOT EXISTS idx_audit_logs_zona_id ON audit_logs(zona_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_is_suspicious ON audit_logs(is_suspicious) WHERE is_suspicious = TRUE;
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);

-- ============================================================
-- Enable Row Level Security (RLS)
-- ============================================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- That's it! Table is ready for use.
-- RLS policies and functions can be added later if needed.
-- ============================================================
