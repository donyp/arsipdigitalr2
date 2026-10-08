-- Create session_invalidations table for tracking auto-logout events (PostgreSQL)
CREATE TABLE IF NOT EXISTS session_invalidations (
    id BIGSERIAL PRIMARY KEY,
    invalidated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Get the latest invalidation time to check if a JWT was issued before it
-- In authentication middleware: if JWT issued_at < last_invalidation.invalidated_at, reject the token
CREATE INDEX IF NOT EXISTS idx_session_invalidations_invalidated_at ON session_invalidations(invalidated_at);
