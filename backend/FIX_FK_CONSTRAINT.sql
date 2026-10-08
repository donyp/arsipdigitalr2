-- Fix FK Constraint Issue
-- The FK constraint is checking against a different schema/table
-- Solution: Drop and recreate the table with proper FK

-- Step 1: Backup existing data
CREATE TABLE daily_login_tokens_backup AS
SELECT * FROM daily_login_tokens;

-- Step 2: Drop the problematic table
DROP TABLE IF EXISTS daily_login_tokens CASCADE;

-- Step 3: Recreate with proper FK (no schema prefix, direct reference)
CREATE TABLE daily_login_tokens (
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
    
    -- FK: Direct reference to public.users table
    CONSTRAINT fk_daily_tokens_user 
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- Step 4: Create indexes
CREATE INDEX idx_daily_tokens_user_token ON daily_login_tokens(user_id, token);
CREATE INDEX idx_daily_tokens_expires_at ON daily_login_tokens(expires_at);
CREATE INDEX idx_daily_tokens_email_sent ON daily_login_tokens(email_sent, user_id);
CREATE INDEX idx_daily_tokens_used ON daily_login_tokens(is_used, expires_at);
CREATE INDEX idx_daily_tokens_locked ON daily_login_tokens(is_locked, locked_until);

-- Step 5: Restore data (optional - only tokens that are valid)
INSERT INTO daily_login_tokens 
SELECT * FROM daily_login_tokens_backup 
WHERE user_id IN (SELECT id FROM public.users);

-- Step 6: Verify
SELECT COUNT(*) as total_tokens FROM daily_login_tokens;
SELECT COUNT(*) as total_users FROM public.users WHERE role IN ('super_admin', 'moderator');

-- Step 7: Clean up backup (after verification)
-- DROP TABLE daily_login_tokens_backup;
