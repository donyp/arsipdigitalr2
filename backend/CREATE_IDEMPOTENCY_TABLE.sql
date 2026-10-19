-- ============================================================
-- Idempotency Table - Prevent Duplicate Transactions
-- ============================================================

-- Create idempotent_requests table untuk tracking duplicate requests
CREATE TABLE IF NOT EXISTS public.idempotent_requests (
    id BIGSERIAL PRIMARY KEY,
    idempotency_key VARCHAR(100) UNIQUE NOT NULL,
    status_code INT NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- Index untuk fast lookup by idempotency_key
CREATE INDEX IF NOT EXISTS idx_idempotent_key ON public.idempotent_requests(idempotency_key);

-- Index untuk cleanup queries (expired records)
CREATE INDEX IF NOT EXISTS idx_idempotent_expires ON public.idempotent_requests(expires_at);

-- Index untuk user tracking
CREATE INDEX IF NOT EXISTS idx_idempotent_user ON public.idempotent_requests(user_id);

-- Create table untuk tracking idempotency statistics
CREATE TABLE IF NOT EXISTS public.idempotency_stats (
    id BIGSERIAL PRIMARY KEY,
    date DATE DEFAULT CURRENT_DATE,
    total_requests BIGINT DEFAULT 0,
    duplicate_prevented BIGINT DEFAULT 0,
    cache_hits BIGINT DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index untuk stats queries
CREATE INDEX IF NOT EXISTS idx_idempotency_stats_date ON public.idempotency_stats(date);

-- Enable row level security
ALTER TABLE public.idempotent_requests ENABLE ROW LEVEL SECURITY;

-- Create cleanup policy (delete expired records)
CREATE OR REPLACE FUNCTION cleanup_expired_idempotent_requests()
RETURNS void AS $$
BEGIN
    DELETE FROM public.idempotent_requests
    WHERE expires_at < NOW();
    
    RAISE NOTICE 'Cleaned up expired idempotent requests';
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup (daily at 2 AM)
-- Note: Requires pg_cron extension
-- SELECT cron.schedule('cleanup_idempotent', '0 2 * * *', 'SELECT cleanup_expired_idempotent_requests()');

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.idempotent_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.idempotency_stats TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE public.idempotent_requests IS 'Stores idempotent request responses to prevent duplicate processing';
COMMENT ON COLUMN public.idempotent_requests.idempotency_key IS 'Unique key provided by client (UUID or custom identifier)';
COMMENT ON COLUMN public.idempotent_requests.status_code IS 'HTTP status code of the original response';
COMMENT ON COLUMN public.idempotent_requests.response_body IS 'Cached response body to return on retry';
COMMENT ON COLUMN public.idempotent_requests.expires_at IS 'Time when this cached response should be deleted';

COMMENT ON TABLE public.idempotency_stats IS 'Statistics about idempotent request deduplication';
