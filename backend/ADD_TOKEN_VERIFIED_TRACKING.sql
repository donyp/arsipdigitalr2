-- Add token verification tracking to daily_login_tokens table
-- This allows admins to login once per day without re-entering the token

ALTER TABLE public.daily_login_tokens
ADD COLUMN IF NOT EXISTS token_verified_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create index for faster lookup
CREATE INDEX IF NOT EXISTS idx_token_verified_at ON public.daily_login_tokens(user_id, token_verified_at);

-- Add comment for documentation
COMMENT ON COLUMN public.daily_login_tokens.token_verified_at IS 'Timestamp when token was successfully verified by user. NULL if not yet verified. Used to allow single token verification per day for admins.';
