-- Add username column to users table for alternative login method
-- Username must be unique and can be used instead of email for login

ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE DEFAULT NULL;

-- Create index on username for faster login queries
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;

-- Verify the changes
SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position;
