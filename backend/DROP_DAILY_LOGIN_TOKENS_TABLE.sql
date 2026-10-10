-- Migration: Remove Daily Token System from Database
-- Date: 2026-10-10
-- Description: Drop daily_login_tokens table and all related indexes
-- This removes the 2FA token system completely from the database

-- Drop all indexes on daily_login_tokens table
DROP INDEX IF EXISTS idx_daily_tokens_user_token;
DROP INDEX IF EXISTS idx_daily_tokens_expires_at;
DROP INDEX IF EXISTS idx_daily_tokens_email_sent;
DROP INDEX IF EXISTS idx_daily_tokens_used;
DROP INDEX IF EXISTS idx_daily_tokens_locked;

-- Drop the daily_login_tokens table
DROP TABLE IF EXISTS daily_login_tokens CASCADE;

-- Verify table is removed
-- SELECT EXISTS (
--   SELECT FROM information_schema.tables 
--   WHERE table_name = 'daily_login_tokens'
-- );
