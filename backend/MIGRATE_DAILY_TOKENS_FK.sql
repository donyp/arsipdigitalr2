-- Migration: Fix daily_login_tokens foreign key constraint
-- Changes FK from auth.users(id) to users(id)
-- This allows tokens to be generated for all users in the users table

-- Step 1: Drop the old foreign key constraint
ALTER TABLE daily_login_tokens 
DROP CONSTRAINT IF EXISTS fk_daily_tokens_user;

-- Step 2: Add the new foreign key to users table
ALTER TABLE daily_login_tokens 
ADD CONSTRAINT fk_daily_tokens_user 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Verify the constraint was applied
-- SELECT constraint_name, table_name, column_name 
-- FROM information_schema.key_column_usage 
-- WHERE table_name = 'daily_login_tokens';
