-- ============================================================
-- Migrasi: kolom kanal pada notifikasi WhatsApp invoice
-- ============================================================
-- TUJUAN
--   Menyimpan info kanal pengiriman pesan WA invoice:
--     sent_via        : 'copy' (klik Salin) | 'manual' | 'bot' (otomatis)
--     announcement_id : id pengumuman (kalau pesan juga dikirim via pengumuman)
--     bot_message_id  : id antrean bot WA (kalau dikirim otomatis ke grup)
--     merged_count    : berapa kali pesan digabung dengan upload berikutnya
--
-- CATATAN
--   - Semua kolom OPSIONAL. Aplikasi tetap berjalan normal kalau migrasi ini
--     belum dijalankan (kolom dibaca hanya bila tersedia).
--   - Jalankan sekali di Supabase > SQL Editor.
--   - Rollback: ALTER TABLE ... DROP COLUMN (4 kolom di bawah).
-- ============================================================

ALTER TABLE public.whatsapp_invoice_notifications
    ADD COLUMN IF NOT EXISTS sent_via text,
    ADD COLUMN IF NOT EXISTS announcement_id uuid,
    ADD COLUMN IF NOT EXISTS bot_message_id text,
    ADD COLUMN IF NOT EXISTS merged_count integer DEFAULT 1;

-- Index kecil untuk pencarian pesan yang sudah dikirim lewat kanal tertentu
CREATE INDEX IF NOT EXISTS idx_wa_inv_notif_sent_via
    ON public.whatsapp_invoice_notifications (sent_via);

-- Catatan: NOTIFICATION 'invoice_upload' dipakai untuk pesan upload invoice PDF.
-- Tabel 'whatsapp_notifications' (notifikasi upload Excel) tidak lagi dipakai
-- since notifikasi WA khusus upload invoice PDF.
