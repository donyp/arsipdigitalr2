-- Fix username column to ensure it's truly nullable
-- This migration handles the case where the username column might have been created with NOT NULL

-- First, check current constraint
-- SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'username';

-- If username is NOT NULL, we need to alter it to allow NULL
-- Using ALTER to modify the constraint

-- Option 1: For PostgreSQL (Supabase)
ALTER TABLE users 
ALTER COLUMN username DROP NOT NULL;

-- Verify the fix
SELECT column_name, is_nullable, data_type FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'username';
