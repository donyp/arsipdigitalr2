-- ============================================================
-- DROP user_sessions TABLE
-- Remove all session management infrastructure from database
-- ============================================================

-- Drop related functions first (if they exist)
DROP FUNCTION IF EXISTS cleanup_expired_sessions() CASCADE;
DROP FUNCTION IF EXISTS count_active_sessions(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_user_active_sessions(UUID) CASCADE;

-- Drop the table
DROP TABLE IF EXISTS user_sessions CASCADE;

-- Confirmation
SELECT 'user_sessions table and all related functions dropped successfully' AS status;
