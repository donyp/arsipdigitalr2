-- ============================================================
-- Sistem Token Login Harian (Daily Login Token / 2FA Email)
-- ============================================================
-- Alur:
--   * Token berlaku per "periode" (default 24 jam). Satu token bisa
--     dipakai terus (untuk login berulang) sampai token di-reset.
--   * Reset token mengikuti sistem auto-logout harian: saat periode baru
--     dimulai, token baru dibuat & dikirim email, token lama otomatis
--     nonaktif, dan seluruh verifikasi user di-reset (harus input ulang).
--   * Admin Zona : tiap user punya token sendiri (dikirim ke email user).
--   * Moderator/Super Admin : tiap user juga punya token SENDIRI (berbeda-beda),
--     namun semuanya dikirim ke 1 email induk (settings.admin_group_email).
--
-- Eksekusi file ini di Supabase SQL Editor.
-- ============================================================

-- 1) Daftar token aktif per scope
CREATE TABLE IF NOT EXISTS auth_token_keys (
    id            BIGSERIAL PRIMARY KEY,
    scope         TEXT UNIQUE NOT NULL,     -- 'user:<uuid>' (tiap user token sendiri)
    token_hash    TEXT NOT NULL,            -- SHA-256 dari token (bukan plaintext)
    token_preview TEXT,                     -- 4 karakter terakhir (untuk tampilan admin)
    created_at    TIMESTAMPTZ DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,
    is_active     BOOLEAN DEFAULT TRUE,
    email_sent    BOOLEAN DEFAULT FALSE,
    email_sent_at TIMESTAMPTZ,
    email_address TEXT                      -- tujuan email (untuk info admin)
);

CREATE INDEX IF NOT EXISTS idx_auth_token_keys_scope_active
    ON auth_token_keys (scope, is_active);
CREATE INDEX IF NOT EXISTS idx_auth_token_keys_expires
    ON auth_token_keys (expires_at);

-- 2) Verifikasi user terhadap token (sekali per periode per user)
CREATE TABLE IF NOT EXISTS auth_token_verifications (
    id          BIGSERIAL PRIMARY KEY,
    token_id    BIGINT NOT NULL REFERENCES auth_token_keys(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL,
    verified_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (token_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_auth_token_verifications_user
    ON auth_token_verifications (user_id, token_id);

-- 3) Log aktivitas token (audit ringan)
CREATE TABLE IF NOT EXISTS auth_token_logs (
    id         BIGSERIAL PRIMARY KEY,
    action     TEXT NOT NULL,               -- generate | send | verify_ok | verify_fail | reset | resend
    scope      TEXT,
    user_id    UUID,
    email      TEXT,
    detail     TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_token_logs_created
    ON auth_token_logs (created_at);