-- FIX: Grant proper permissions to backup tables
-- Run this in Supabase SQL Editor if backups keep failing with UnknownError

-- Drop existing grants (if any)
DROP POLICY IF EXISTS "Admin can view all backup history" ON backup_history;
DROP POLICY IF EXISTS "Only super_admin can manage backup config" ON backup_config;

-- Disable RLS to allow server-side access
ALTER TABLE backup_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE backup_config DISABLE ROW LEVEL SECURITY;

-- Grant all permissions to authenticated role (used by service role)
GRANT ALL PRIVILEGES ON backup_history TO authenticated;
GRANT ALL PRIVILEGES ON backup_config TO authenticated;

-- Grant permissions on sequences (for auto-incrementing id)
GRANT USAGE, SELECT ON SEQUENCE backup_history_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE backup_config_id_seq TO authenticated;

-- Verify permissions
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name = 'backup_history';
