-- Maintenance Mode Tables - Fixed Version with UUID
-- Run this SQL in Supabase to create the necessary tables

-- 1. Active sessions tracking (PRIMARY - this is what we need)
CREATE TABLE IF NOT EXISTS active_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    username VARCHAR(255),
    user_role VARCHAR(50),
    token_jti VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent TEXT,
    is_valid BOOLEAN DEFAULT TRUE,
    maintenance_forced_logout BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    last_activity TIMESTAMP DEFAULT NOW()
);

-- 2. Maintenance access logs
CREATE TABLE IF NOT EXISTS maintenance_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    username VARCHAR(255),
    user_role VARCHAR(50),
    action VARCHAR(100),
    ip_address VARCHAR(45),
    user_agent TEXT,
    reason TEXT,
    details JSONB,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- 3. Forced logout tracking
CREATE TABLE IF NOT EXISTS forced_logout_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    username VARCHAR(255),
    user_role VARCHAR(50),
    token_jti VARCHAR(255),
    logout_reason VARCHAR(100),
    ip_address VARCHAR(45),
    logged_out_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id ON active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_is_valid ON active_sessions(is_valid);
CREATE INDEX IF NOT EXISTS idx_active_sessions_last_activity ON active_sessions(last_activity DESC);

CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON maintenance_access_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON maintenance_access_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_logouts_user_id ON forced_logout_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_logouts_logged_out_at ON forced_logout_sessions(logged_out_at DESC);

-- Enable Row Level Security
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE forced_logout_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all authenticated users to read/write
CREATE POLICY "Allow all authenticated" ON active_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all authenticated" ON maintenance_access_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all authenticated" ON forced_logout_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Grant permissions
GRANT ALL ON active_sessions TO authenticated;
GRANT ALL ON maintenance_access_logs TO authenticated;
GRANT ALL ON forced_logout_sessions TO authenticated;

