-- Create session_invalidations table for tracking auto-logout events
-- This allows us to invalidate all sessions at a specific time
CREATE TABLE IF NOT EXISTS session_invalidations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    invalidated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_invalidated_at (invalidated_at)
);

-- Get the latest invalidation time to check if a JWT was issued before it
-- In authentication middleware: if JWT issued_at < last_invalidation.invalidated_at, reject the token
