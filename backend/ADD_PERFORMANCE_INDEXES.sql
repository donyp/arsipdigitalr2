-- ============================================================
-- Performance Indexes - Filter Bulan / Daftar File
-- ============================================================
-- Tanggal: 20 Oktober 2026
-- Tujuan:
--   1. Mempercepat query filter tanggal (date_from/date_to) pada
--      /api/invoice/list  -> SELECT ... WHERE zona_id = ? AND tanggal BETWEEN ? AND ?
--   2. Mempercepat /api/files (start_date/end_date + zona_id) dan COUNT exact
--   3. Mempercepat background scan R2 (filter files_uploaded_count = 0)
--
-- CARA PAKAI:
--   1. Buka Supabase Dashboard > SQL Editor > New query
--   2. Paste seluruh isi file ini > Run
--   3. Tidak mengubah data / kolom / constraint. Hanya menambah index.
--
-- CATATAN:
--   - Semua memakai IF NOT EXISTS -> aman dijalankan berulang.
--   - CREATE INDEX (bukan CONCURRENTLY) mengunci writes sebentar.
--     Jalankan saat jam sepi. Jika tabel besar dan tidak bisa mengunci,
--     jalankan per baris dengan CREATE INDEX CONCURRENTLY (di luar transaksi).
--   - Setelah selesai, cek: SELECT pg_stat_user_indexes WHERE relname IN ('files','invoice_file_list');
-- ============================================================


-- ============================================================
-- 1. invoice_file_list (daftar invoice)
-- ============================================================

-- Filter utama: zona + rentang tanggal (dipakai saat filter bulan)
CREATE INDEX IF NOT EXISTS idx_invoice_file_list_zona_tanggal
    ON public.invoice_file_list (zona_id, tanggal DESC);

-- Filter tanggal tanpa zona (super_admin / moderator)
CREATE INDEX IF NOT EXISTS idx_invoice_file_list_tanggal
    ON public.invoice_file_list (tanggal DESC);

-- Filter berdasarkan kategori PPN/NON (dipakai dropdown kategori)
CREATE INDEX IF NOT EXISTS idx_invoice_file_list_keterangan
    ON public.invoice_file_list (keterangan);

-- Background scan R2 hanya memindai invoice yang belum punya hitungan file
CREATE INDEX IF NOT EXISTS idx_invoice_file_list_files_missing
    ON public.invoice_file_list (zona_id, tanggal DESC)
    WHERE files_uploaded_count = 0;


-- ============================================================
-- 2. files (daftar file arsip / Data File)
-- ============================================================

-- Filter tanggal + urut created_at (query /api/files)
CREATE INDEX IF NOT EXISTS idx_files_active_created
    ON public.files (created_at DESC)
    WHERE deleted_at IS NULL;

-- Filter zona + tanggal (query /api/files per zona)
CREATE INDEX IF NOT EXISTS idx_files_zona_active_created
    ON public.files (zona_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- Filter kategori (INVOICE / PPN / NON / PIUTANG)
CREATE INDEX IF NOT EXISTS idx_files_active_category
    ON public.files (category, created_at DESC)
    WHERE deleted_at IS NULL;


-- ============================================================
-- 3. Verifikasi (jalankan setelah index dibuat)
-- ============================================================
-- SELECT indexname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) AS size
-- FROM pg_stat_user_indexes
-- WHERE relname IN ('files', 'invoice_file_list')
-- ORDER BY idx_scan DESC;

-- Cek query utama memakai index:
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT * FROM public.invoice_file_list
-- WHERE zona_id = 122 AND tanggal BETWEEN '2026-09-01' AND '2026-09-30'
-- ORDER BY tanggal DESC
-- LIMIT 20;
