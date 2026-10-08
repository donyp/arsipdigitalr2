-- Create daily_login_tokens table for 2FA daily token system (PostgreSQL + Supabase)
CREATE TABLE IF NOT EXISTS daily_login_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    token VARCHAR(5) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE NULL,
    is_used BOOLEAN DEFAULT FALSE,
    token_attempts INT DEFAULT 0,
    last_attempt_at TIMESTAMP WITH TIME ZONE NULL,
    is_locked BOOLEAN DEFAULT FALSE,
    locked_until TIMESTAMP WITH TIME ZONE NULL,
    email_sent BOOLEAN DEFAULT FALSE,
    email_sent_at TIMESTAMP WITH TIME ZONE NULL,
    email_address VARCHAR(255),
    
    CONSTRAINT fk_daily_tokens_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Add indexes for query optimization
CREATE INDEX IF NOT EXISTS idx_daily_tokens_user_token ON daily_login_tokens(user_id, token);
CREATE INDEX IF NOT EXISTS idx_daily_tokens_expires_at ON daily_login_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_daily_tokens_email_sent ON daily_login_tokens(email_sent, user_id);
CREATE INDEX IF NOT EXISTS idx_daily_tokens_used ON daily_login_tokens(is_used, expires_at);
CREATE INDEX IF NOT EXISTS idx_daily_tokens_locked ON daily_login_tokens(is_locked, locked_until);
