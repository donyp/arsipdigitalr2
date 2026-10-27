-- ============================================================
-- RESET TOKEN UNTUK PENGETESAN
-- ============================================================
-- Menonaktifkan semua token aktif + menghapus semua verifikasi,
-- sehingga SEMUA user (admin zona/moderator/super admin) wajib
-- input token lagi pada login berikutnya.
--
-- Catatan: Jalankan file ini, lalu klik "Generate & Kirim Sekarang"
-- di halaman token-setup.html untuk membuat + mengirim token baru.
-- ============================================================

-- 1) Nonaktifkan semua token yang masih aktif
UPDATE public.auth_token_keys
SET is_active = FALSE,
    expires_at = now();

-- 2) Hapus semua verifikasi user (wajib input token ulang)
DELETE FROM public.auth_token_verifications;

-- 3) (Opsional) Kosongkan log agar mudah dipantau — hapus komentar bila perlu
-- DELETE FROM public.auth_token_logs;

-- 4) Verifikasi hasil
SELECT
    (SELECT count(*) FROM public.auth_token_keys WHERE is_active = TRUE) AS token_aktif,
    (SELECT count(*) FROM public.auth_token_verifications) AS verifikasi_aktif;