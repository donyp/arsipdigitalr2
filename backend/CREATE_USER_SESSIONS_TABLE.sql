-- ============================================
-- User Sessions Table - Track Active Sessions
-- Max 2 concurrent sessions per user
-- ============================================

CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_token TEXT NOT NULL UNIQUE,
    user_agent TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
    is_active BOOLEAN DEFAULT TRUE
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(user_id, is_active);

-- Function to cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE user_sessions
    SET is_active = FALSE
    WHERE expires_at < NOW() AND is_active = TRUE;
END;
$$;

-- Function to count active sessions for a user
CREATE OR REPLACE FUNCTION count_active_sessions(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    active_count INTEGER;
BEGIN
    -- Cleanup expired sessions first
    PERFORM cleanup_expired_sessions();
    
    -- Count active sessions
    SELECT COUNT(*)
    INTO active_count
    FROM user_sessions
    WHERE user_id = p_user_id
    AND is_active = TRUE
    AND expires_at > NOW();
    
    RETURN active_count;
END;
$$;

-- Function to get active sessions for a user (for admin view)
CREATE OR REPLACE FUNCTION get_user_active_sessions(p_user_id UUID)
RETURNS TABLE (
    session_id UUID,
    user_agent TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ,
    last_activity TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM cleanup_expired_sessions();
    
    RETURN QUERY
    SELECT 
        id,
        user_sessions.user_agent,
        user_sessions.ip_address,
        user_sessions.created_at,
        user_sessions.last_activity,
        user_sessions.expires_at
    FROM user_sessions
    WHERE user_id = p_user_id
    AND is_active = TRUE
    AND user_sessions.expires_at > NOW()
    ORDER BY user_sessions.created_at DESC;
END;
$$;

-- Enable RLS
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own sessions
CREATE POLICY "Users can view own sessions"
ON user_sessions
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Service role can manage all sessions
CREATE POLICY "Service role can manage sessions"
ON user_sessions
FOR ALL
USING (auth.role() = 'service_role');

COMMENT ON TABLE user_sessions IS 'Track active user sessions with max 2 concurrent sessions per user';
COMMENT ON FUNCTION count_active_sessions IS 'Count active sessions for a user (auto-cleanup expired)';
COMMENT ON FUNCTION get_user_active_sessions IS 'Get list of active sessions for a user';
