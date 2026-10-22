-- ============================================================
-- Migrasi: enum tipe pengumuman + kolom kanal notifikasi WA
-- ============================================================
-- Jalankan di Supabase > SQL Editor (satu per blok).
--
-- BLOK 1 (WA notification channels) - opsional
--   Kolom kanal pada notifikasi WhatsApp invoice. Aplikasi tetap jalan
--   normal kalau blok ini belum dijalankan.
--
-- BLOK 2 (announcement type enum) - opsional
--   Menambah tipe pengumuman 'Upload Invoice' supaya notifikasi upload
--   invoice punya ikon khusus. Tanpa ini, pengumuman tetap dibuat dengan
--   tipe 'Informasi' (fallback otomatis, tidak ada error).
-- ============================================================

-- ---------- BLOK 1 ----------
ALTER TABLE public.whatsapp_invoice_notifications
    ADD COLUMN IF NOT EXISTS sent_via text,
    ADD COLUMN IF NOT EXISTS announcement_id uuid,
    ADD COLUMN IF NOT EXISTS bot_message_id text,
    ADD COLUMN IF NOT EXISTS merged_count integer DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_wa_inv_notif_sent_via
    ON public.whatsapp_invoice_notifications (sent_via);

-- ---------- BLOK 2 ----------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'announcement_type_enum' AND e.enumlabel = 'Upload Invoice') THEN
        ALTER TYPE public.announcement_type_enum ADD VALUE 'Upload Invoice';
    END IF;
END
$$;
