-- Create backup history table
CREATE TABLE IF NOT EXISTS backup_history (
    id BIGSERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL, -- 'database', 'files', 'config'
    name VARCHAR(255) NOT NULL,
    size BIGINT, -- in bytes
    path VARCHAR(500), -- Path in R2
    status VARCHAR(50) NOT NULL, -- 'success', 'failed', 'pending'
    error_message TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_backup_type ON backup_history(type);
CREATE INDEX IF NOT EXISTS idx_backup_timestamp ON backup_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_backup_status ON backup_history(status);

-- Create backup retention policy (keep 90 days of backups)
-- Note: Implement this in your cron job or R2 lifecycle policy

-- Create backup config table
CREATE TABLE IF NOT EXISTS backup_config (
    id BIGSERIAL PRIMARY KEY,
    backup_type VARCHAR(50) NOT NULL, -- 'database', 'files', 'config'
    enabled BOOLEAN DEFAULT true,
    schedule_cron VARCHAR(100),
    retention_days INTEGER DEFAULT 30,
    last_run TIMESTAMP WITH TIME ZONE,
    next_run TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default backup configurations
INSERT INTO backup_config (backup_type, schedule_cron, retention_days) VALUES
    ('database', '0 0 * * *', 30), -- Daily at 00:00 UTC
    ('files', '0 2 * * 0', 90),    -- Weekly on Sunday at 02:00 UTC
    ('config', '0 1 * * *', 30)    -- Daily at 01:00 UTC
ON CONFLICT DO NOTHING;

-- Grant permissions for service role (server-side backups)
GRANT ALL PRIVILEGES ON backup_history TO authenticated;
GRANT ALL PRIVILEGES ON backup_config TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE backup_history_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE backup_config_id_seq TO authenticated;

-- Add RLS policies if you want backup history visible only to admins
-- Disabled by default to avoid issues with server-side backups
-- ALTER TABLE backup_history ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE backup_config ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view backup history (drop if exists first)
-- DROP POLICY IF EXISTS "Admin can view all backup history" ON backup_history;
-- CREATE POLICY "Admin can view all backup history" ON backup_history
--     FOR SELECT
--     USING (auth.jwt() ->> 'role' = 'super_admin' OR auth.jwt() ->> 'role' = 'admin');

-- Policy: Only super_admin can manage backup config (drop if exists first)
-- DROP POLICY IF EXISTS "Only super_admin can manage backup config" ON backup_config;
-- CREATE POLICY "Only super_admin can manage backup config" ON backup_config
--     FOR ALL
--     USING (auth.jwt() ->> 'role' = 'super_admin');
