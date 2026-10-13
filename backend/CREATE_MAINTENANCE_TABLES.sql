-- Maintenance Mode Tables - Simplified Version
-- Run this SQL in Supabase to create the necessary tables

-- 1. Main maintenance mode logs
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
    status VARCHAR(20) DEFAULT 'active',
    estimated_end TIMESTAMP
);

-- 2. Access logs (who tried to access, granted or denied)
CREATE TABLE IF NOT EXISTS maintenance_access_logs (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id VARCHAR(255),
    user_email VARCHAR(255),
    username VARCHAR(255),
    user_role VARCHAR(50),
    action VARCHAR(50),
    timestamp TIMESTAMP DEFAULT NOW(),
    ip_address VARCHAR(50),
    user_agent TEXT,
    reason VARCHAR(255)
);

-- 3. Forced logout tracking
CREATE TABLE IF NOT EXISTS forced_logout_sessions (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id VARCHAR(255),
    user_email VARCHAR(255),
    username VARCHAR(255),
    user_role VARCHAR(50),
    token_jti VARCHAR(255),
    logged_out_at TIMESTAMP DEFAULT NOW(),
    logout_reason VARCHAR(100),
    ip_address VARCHAR(50)
);

-- 4. Active sessions tracking
CREATE TABLE IF NOT EXISTS active_sessions (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id VARCHAR(255) NOT NULL,
    user_email VARCHAR(255),
    username VARCHAR(255),
    user_role VARCHAR(50),
    token_jti VARCHAR(255) UNIQUE,
    login_timestamp TIMESTAMP DEFAULT NOW(),
    last_activity TIMESTAMP DEFAULT NOW(),
    ip_address VARCHAR(50),
    user_agent TEXT,
    is_valid BOOLEAN DEFAULT TRUE,
    maintenance_forced_logout BOOLEAN DEFAULT FALSE
);

-- Enable Row Level Security
ALTER TABLE maintenance_mode_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE forced_logout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;

-- Create simple policies
CREATE POLICY "Allow all authenticated" ON maintenance_mode_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all authenticated" ON maintenance_access_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all authenticated" ON forced_logout_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all authenticated" ON active_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Grant basic permissions
GRANT ALL ON maintenance_mode_logs TO authenticated;
GRANT ALL ON maintenance_access_logs TO authenticated;
GRANT ALL ON forced_logout_sessions TO authenticated;
GRANT ALL ON active_sessions TO authenticated;
