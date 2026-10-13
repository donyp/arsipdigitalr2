-- Maintenance Mode Tables for Role-Based Access Control
-- Allows moderators-only access during maintenance windows

-- Main maintenance mode status and history
CREATE TABLE IF NOT EXISTS maintenance_mode_logs (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    is_active BOOLEAN DEFAULT FALSE,
    allowed_role VARCHAR(50) DEFAULT 'moderator',
    started_at TIMESTAMP DEFAULT NOW(),
    started_by VARCHAR(255),
    reason TEXT NOT NULL,
    description TEXT,
    estimated_duration_minutes INT,
    end_time TIMESTAMP,
    ended_by VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active', -- active, scheduled, completed, cancelled
    estimated_end TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by VARCHAR(255),
    notes TEXT
);

-- Access attempts during maintenance mode
CREATE TABLE IF NOT EXISTS maintenance_access_logs (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id VARCHAR(255),
    username VARCHAR(255),
    user_role VARCHAR(50),
    action VARCHAR(20), -- granted, denied, attempt, failed_login
    timestamp TIMESTAMP DEFAULT NOW(),
    ip_address VARCHAR(50),
    user_agent TEXT,
    maintenance_session_id BIGINT REFERENCES maintenance_mode_logs(id),
    reason VARCHAR(255),
    details JSONB
);

-- Track forced logout sessions
CREATE TABLE IF NOT EXISTS forced_logout_sessions (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    maintenance_session_id BIGINT REFERENCES maintenance_mode_logs(id),
    user_id VARCHAR(255),
    username VARCHAR(255),
    user_role VARCHAR(50),
    token_jti VARCHAR(255), -- JWT token ID
    logged_out_at TIMESTAMP DEFAULT NOW(),
    logout_reason VARCHAR(100), -- maintenance_start, maintenance_mode_check
    ip_address VARCHAR(50)
);

-- Active sessions to track who's currently logged in
CREATE TABLE IF NOT EXISTS active_sessions (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id VARCHAR(255) NOT NULL,
    username VARCHAR(255),
    user_role VARCHAR(50),
    token_jti VARCHAR(255) UNIQUE, -- JWT Token ID
    login_timestamp TIMESTAMP DEFAULT NOW(),
    last_activity TIMESTAMP DEFAULT NOW(),
    ip_address VARCHAR(50),
    user_agent TEXT,
    is_valid BOOLEAN DEFAULT TRUE,
    maintenance_forced_logout BOOLEAN DEFAULT FALSE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_maintenance_is_active ON maintenance_mode_logs(is_active, status);
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_created ON maintenance_mode_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_timestamp ON maintenance_access_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_action ON maintenance_access_logs(action);
CREATE INDEX IF NOT EXISTS idx_forced_logout_user ON forced_logout_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_user ON active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_jti ON active_sessions(token_jti);
CREATE INDEX IF NOT EXISTS idx_active_sessions_valid ON active_sessions(is_valid, user_role);

-- Function to log access attempts
CREATE OR REPLACE FUNCTION log_maintenance_access(
    p_user_id VARCHAR,
    p_username VARCHAR,
    p_role VARCHAR,
    p_action VARCHAR,
    p_ip VARCHAR,
    p_user_agent TEXT,
    p_reason VARCHAR DEFAULT NULL,
    p_details JSONB DEFAULT NULL
) RETURNS void AS $$
BEGIN
    INSERT INTO maintenance_access_logs (
        user_id, username, user_role, action, 
        ip_address, user_agent, maintenance_session_id,
        reason, details
    ) VALUES (
        p_user_id, p_username, p_role, p_action,
        p_ip, p_user_agent,
        (SELECT id FROM maintenance_mode_logs WHERE is_active = TRUE LIMIT 1),
        p_reason, p_details
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get current maintenance status
CREATE OR REPLACE FUNCTION get_maintenance_status()
RETURNS TABLE (
    is_active BOOLEAN,
    allowed_role VARCHAR,
    reason TEXT,
    started_at TIMESTAMP,
    started_by VARCHAR,
    estimated_end TIMESTAMP,
    estimated_minutes_remaining INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.is_active,
        m.allowed_role,
        m.reason,
        m.started_at,
        m.started_by,
        m.estimated_end,
        EXTRACT(EPOCH FROM (m.estimated_end - NOW()))::INT / 60 as estimated_minutes
    FROM maintenance_mode_logs m
    WHERE m.is_active = TRUE
    ORDER BY m.started_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to start maintenance mode
CREATE OR REPLACE FUNCTION start_maintenance_mode(
    p_reason TEXT,
    p_description TEXT,
    p_duration_minutes INT,
    p_started_by VARCHAR
) RETURNS TABLE (
    success BOOLEAN,
    maintenance_id BIGINT,
    message VARCHAR
) AS $$
DECLARE
    v_existing_maintenance BIGINT;
    v_new_id BIGINT;
BEGIN
    -- Check if maintenance already active
    SELECT id INTO v_existing_maintenance 
    FROM maintenance_mode_logs 
    WHERE is_active = TRUE 
    LIMIT 1;
    
    IF v_existing_maintenance IS NOT NULL THEN
        RETURN QUERY SELECT 
            false::BOOLEAN, 
            v_existing_maintenance::BIGINT, 
            'Maintenance mode already active'::VARCHAR;
        RETURN;
    END IF;
    
    -- Create new maintenance session
    INSERT INTO maintenance_mode_logs (
        is_active, allowed_role, reason, description,
        estimated_duration_minutes, started_by, status,
        estimated_end
    ) VALUES (
        TRUE, 'moderator', p_reason, p_description,
        p_duration_minutes, p_started_by, 'active',
        NOW() + (p_duration_minutes || ' minutes')::INTERVAL
    )
    RETURNING maintenance_mode_logs.id INTO v_new_id;
    
    RETURN QUERY SELECT 
        true::BOOLEAN, 
        v_new_id::BIGINT, 
        'Maintenance mode started'::VARCHAR;
END;
$$ LANGUAGE plpgsql;

-- Function to end maintenance mode
CREATE OR REPLACE FUNCTION end_maintenance_mode(
    p_maintenance_id BIGINT,
    p_ended_by VARCHAR
) RETURNS TABLE (
    success BOOLEAN,
    message VARCHAR
) AS $$
BEGIN
    UPDATE maintenance_mode_logs
    SET 
        is_active = FALSE,
        status = 'completed',
        end_time = NOW(),
        ended_by = p_ended_by,
        updated_at = NOW(),
        updated_by = p_ended_by
    WHERE id = p_maintenance_id;
    
    RETURN QUERY SELECT 
        true::BOOLEAN, 
        'Maintenance mode ended'::VARCHAR;
END;
$$ LANGUAGE plpgsql;

-- Cleanup old sessions (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_maintenance_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM maintenance_access_logs
    WHERE timestamp < NOW() - INTERVAL '30 days';
    
    DELETE FROM forced_logout_sessions
    WHERE logged_out_at < NOW() - INTERVAL '30 days';
    
    DELETE FROM active_sessions
    WHERE login_timestamp < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_mode_logs TO authenticated;
GRANT SELECT, INSERT ON maintenance_access_logs TO authenticated;
GRANT SELECT, INSERT ON forced_logout_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON active_sessions TO authenticated;

-- Add RLS (Row Level Security) policies
ALTER TABLE maintenance_mode_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE forced_logout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read (but not modify their own sessions)
CREATE POLICY "Allow authenticated read maintenance logs" 
ON maintenance_mode_logs FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Allow read access logs"
ON maintenance_access_logs FOR SELECT
TO authenticated
USING (true);

-- Allow service role to manage (from backend)
CREATE POLICY "Allow service role manage maintenance"
ON maintenance_mode_logs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
