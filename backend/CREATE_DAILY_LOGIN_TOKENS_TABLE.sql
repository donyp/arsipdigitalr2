-- Create daily_login_tokens table for 2FA daily token system
CREATE TABLE IF NOT EXISTS daily_login_tokens (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    token VARCHAR(5) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    is_used BOOLEAN DEFAULT FALSE,
    token_attempts INT DEFAULT 0,
    last_attempt_at TIMESTAMP NULL,
    is_locked BOOLEAN DEFAULT FALSE,
    locked_until TIMESTAMP NULL,
    email_sent BOOLEAN DEFAULT FALSE,
    email_sent_at TIMESTAMP NULL,
    email_address VARCHAR(255),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_token (user_id, token),
    INDEX idx_expires_at (expires_at),
    INDEX idx_email_sent (email_sent, user_id)
);

-- Add indexes for query optimization
CREATE INDEX idx_token_used ON daily_login_tokens(is_used, expires_at);
CREATE INDEX idx_token_locked ON daily_login_tokens(is_locked, locked_until);
