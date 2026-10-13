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
    user_email VARCHAR(255),
    username VARCHAR(255),
    user_role VARCHAR(50),
    action VARCHAR(50), -- granted, denied, attempt, failed_login, maintenance_started, maintenance_ended
    timestamp TIMESTAMP DEFAULT NOW(),
    ip_address VARCHAR(50),
    user_agent TEXT,
    reason VARCHAR(255),
    details JSONB
);

-- Track forced logout sessions
CREATE TABLE IF NOT EXISTS forced_logout_sessions (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id VARCHAR(255),
    user_email VARCHAR(255),
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
    user_email VARCHAR(255),
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
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_created ON maintenance_mode_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_timestamp ON maintenance_access_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_action ON maintenance_access_logs(action);
CREATE INDEX IF NOT EXISTS idx_access_logs_user ON maintenance_access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_forced_logout_user ON forced_logout_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_forced_logout_jti ON forced_logout_sessions(token_jti);
CREATE INDEX IF NOT EXISTS idx_active_sessions_user ON active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_jti ON active_sessions(token_jti);
CREATE INDEX IF NOT EXISTS idx_active_sessions_valid ON active_sessions(is_valid);
CREATE INDEX IF NOT EXISTS idx_active_sessions_email ON active_sessions(user_email);
CREATE INDEX IF NOT EXISTS idx_maintenance_access_logs_email ON maintenance_access_logs(user_email);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_mode_logs TO authenticated;
GRANT SELECT, INSERT ON maintenance_access_logs TO authenticated;
GRANT SELECT, INSERT ON forced_logout_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON active_sessions TO authenticated;

-- Add RLS (Row Level Security) - simple allow all
ALTER TABLE maintenance_mode_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE forced_logout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read maintenance logs
CREATE POLICY "Allow authenticated read maintenance" 
ON maintenance_mode_logs FOR SELECT 
TO authenticated 
USING (true);

-- Allow authenticated users to read access logs
CREATE POLICY "Allow read access logs"
ON maintenance_access_logs FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to read/write forced logouts
CREATE POLICY "Allow manage forced logouts"
ON forced_logout_sessions FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow authenticated users to read/write active sessions
CREATE POLICY "Allow manage active sessions"
ON active_sessions FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow service role to manage all
CREATE POLICY "Allow service role manage maintenance"
ON maintenance_mode_logs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow service role manage access logs"
ON maintenance_access_logs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
