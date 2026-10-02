-- ============================================================
-- AUDIT LOGS TABLE - Track all critical operations
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User Information
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email VARCHAR(255),
    user_role VARCHAR(50),
    zona_id INTEGER,
    
    -- Action Information
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL, -- 'invoice', 'file', 'user', 'zona', etc
    resource_id VARCHAR(255),
    resource_name VARCHAR(255),
    
    -- Operation Details
    operation VARCHAR(20) NOT NULL, -- 'CREATE', 'READ', 'UPDATE', 'DELETE', 'DOWNLOAD'
    old_values JSONB, -- Previous state (for updates)
    new_values JSONB, -- New state (for creates/updates)
    
    -- Request Information
    ip_address INET,
    user_agent TEXT,
    request_path VARCHAR(255),
    request_method VARCHAR(10),
    
    -- Response Information
    status_code INTEGER,
    response_message TEXT,
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Metadata
    is_suspicious BOOLEAN DEFAULT FALSE,
    severity VARCHAR(20) DEFAULT 'info' -- 'info', 'warning', 'critical'
);

-- ============================================================
-- INDEXES for fast querying
-- ============================================================
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX idx_audit_logs_operation ON audit_logs(operation);
CREATE INDEX idx_audit_logs_zona_id ON audit_logs(zona_id);
CREATE INDEX idx_audit_logs_is_suspicious ON audit_logs(is_suspicious) WHERE is_suspicious = TRUE;
CREATE INDEX idx_audit_logs_severity ON audit_logs(severity);

-- ============================================================
-- Enable Row Level Security (RLS)
-- ============================================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only moderators and super_admins can view ALL logs
-- Regular users and admin_zona can only view logs related to their zone
CREATE POLICY "moderators_view_all_logs" ON audit_logs
    FOR SELECT
    USING (
        auth.jwt() ->> 'role' IN ('super_admin', 'moderator')
    );

CREATE POLICY "admin_zona_view_own_zone_logs" ON audit_logs
    FOR SELECT
    USING (
        auth.jwt() ->> 'role' = 'admin_zona'
        AND zona_id = (auth.jwt() ->> 'zona_id')::INTEGER
    );

-- Only super_admin can modify logs (insert happens via backend trigger, not user)
CREATE POLICY "super_admin_insert_logs" ON audit_logs
    FOR INSERT
    WITH CHECK (
        auth.jwt() ->> 'role' = 'super_admin'
    );

-- ============================================================
-- AUDIT LOG FUNCTION - Called by trigger
-- ============================================================
CREATE OR REPLACE FUNCTION log_audit_event(
    p_user_id UUID,
    p_user_email VARCHAR,
    p_user_role VARCHAR,
    p_zona_id INTEGER,
    p_action VARCHAR,
    p_resource_type VARCHAR,
    p_resource_id VARCHAR,
    p_resource_name VARCHAR,
    p_operation VARCHAR,
    p_old_values JSONB,
    p_new_values JSONB,
    p_ip_address INET,
    p_user_agent TEXT,
    p_request_path VARCHAR,
    p_request_method VARCHAR,
    p_status_code INTEGER,
    p_response_message TEXT,
    p_error_message TEXT,
    p_is_suspicious BOOLEAN DEFAULT FALSE,
    p_severity VARCHAR DEFAULT 'info'
) RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO audit_logs (
        user_id, user_email, user_role, zona_id,
        action, resource_type, resource_id, resource_name,
        operation, old_values, new_values,
        ip_address, user_agent, request_path, request_method,
        status_code, response_message, error_message,
        is_suspicious, severity
    ) VALUES (
        p_user_id, p_user_email, p_user_role, p_zona_id,
        p_action, p_resource_type, p_resource_id, p_resource_name,
        p_operation, p_old_values, p_new_values,
        p_ip_address, p_user_agent, p_request_path, p_request_method,
        p_status_code, p_response_message, p_error_message,
        p_is_suspicious, p_severity
    )
    RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RUN THIS SQL IN SUPABASE:
-- 1. Go to SQL Editor
-- 2. Create new query
-- 3. Paste entire content
-- 4. Run query
-- ============================================================
