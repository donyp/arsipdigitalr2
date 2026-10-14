-- Maintenance Mode Tables - ALTER EXISTING TABLE
-- The active_sessions table exists but missing columns
-- Add missing columns to existing table

-- Add missing columns to active_sessions if they don't exist
ALTER TABLE IF EXISTS active_sessions
ADD COLUMN IF NOT EXISTS is_valid BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS maintenance_forced_logout BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS user_role VARCHAR(50),
ADD COLUMN IF NOT EXISTS username VARCHAR(255),
ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45),
ADD COLUMN IF NOT EXISTS user_agent TEXT,
ADD COLUMN IF NOT EXISTS session_id VARCHAR(255);

-- Create maintenance_access_logs if it doesn't exist
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

-- Create forced_logout_sessions if it doesn't exist
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

-- Create indexes for performance (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id ON active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_is_valid ON active_sessions(is_valid);
CREATE INDEX IF NOT EXISTS idx_active_sessions_last_activity ON active_sessions(last_activity DESC);

CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON maintenance_access_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON maintenance_access_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_logouts_user_id ON forced_logout_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_logouts_logged_out_at ON forced_logout_sessions(logged_out_at DESC);

-- All tables configured successfully!

