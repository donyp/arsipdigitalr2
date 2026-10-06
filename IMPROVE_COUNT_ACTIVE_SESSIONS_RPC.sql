-- ============================================
-- IMPROVE count_active_sessions() RPC
-- ============================================
-- Fix: RPC harus juga filter is_active = TRUE
-- sebelum counting, tidak hanya relies on expires_at

-- DROP function dulu
DROP FUNCTION IF EXISTS count_active_sessions(UUID);

-- CREATE IMPROVED version
CREATE OR REPLACE FUNCTION count_active_sessions(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    active_count INTEGER;
BEGIN
    -- Step 1: First cleanup expired sessions (mark as inactive)
    UPDATE user_sessions
    SET is_active = FALSE
    WHERE expires_at < NOW() 
        AND is_active = TRUE;
    
    -- Step 2: Count ONLY sessions yang truly active:
    -- - is_active = TRUE
    -- - expires_at > NOW()
    SELECT COUNT(*)
    INTO active_count
    FROM user_sessions
    WHERE user_id = p_user_id
        AND is_active = TRUE
        AND expires_at > NOW();
    
    RETURN active_count;
END;
$$;

COMMENT ON FUNCTION count_active_sessions(UUID) IS 'Count active sessions for a user: is_active=TRUE AND expires_at>NOW()';
