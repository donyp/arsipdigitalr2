-- ============================================================
-- SETUP SQL WAJIB - Arsip Digital ANKA
-- ============================================================
-- Tanggal : 20 Oktober 2026
-- Jalankan di : Supabase Dashboard > SQL Editor > New query > Run
--
-- Isi file ini (SEMUA idempotent / aman dijalankan berulang):
--   BAGIAN 1  Index untuk performa filter tanggal & query daftar file
--   BAGIAN 2  Trigger penjaga status file (x/3, x/2) - DULUNYA BELUM PERNAH AKTIF
--   BAGIAN 3  Index unik invoice_files (anti duplikat record file)
--   BAGIAN 4  Query verifikasi (hanya baca, aman)
--
-- TIDAK termasuk (sesuai keputusan Anda: biarkan saja):
--   - normalisasi keterangan legacy 'NON PPN' -> 'NON'
--   - pengisian toko_id yang kosong
--   (SQL-nya ada di EXCEL_UPLOAD_FIX.md / FILE_STATUS_ACCURACY_FIX.md bila diperlukan)
--
-- Catatan: CREATE INDEX mengunci writes sebentar. Untuk tabel kecil
-- (ribuan baris) efeknya < 1 detik. Jalankan di jam sepi bila perlu.
-- ============================================================


-- ============================================================
-- BAGIAN 1: INDEX (performa)
-- ============================================================

-- 1.1 invoice_file_list: filter zona + rentang tanggal (filter bulan di dashboard)
CREATE INDEX IF NOT EXISTS idx_invoice_file_list_zona_tanggal
    ON public.invoice_file_list (zona_id, tanggal DESC);

-- 1.2 invoice_file_list: filter tanggal tanpa zona (super_admin / moderator)
CREATE INDEX IF NOT EXISTS idx_invoice_file_list_tanggal
    ON public.invoice_file_list (tanggal DESC);

-- 1.3 invoice_file_list: filter kategori (PPN / NON)
CREATE INDEX IF NOT EXISTS idx_invoice_file_list_keterangan
    ON public.invoice_file_list (keterangan);

-- 1.4 invoice_file_list: background scan file yang belum punya file
CREATE INDEX IF NOT EXISTS idx_invoice_file_list_files_missing
    ON public.invoice_file_list (zona_id, tanggal DESC)
    WHERE files_uploaded_count = 0;

-- 1.5 files: daftar file arsip + filter tanggal upload
CREATE INDEX IF NOT EXISTS idx_files_active_created
    ON public.files (created_at DESC)
    WHERE deleted_at IS NULL;

-- 1.6 files: filter zona + tanggal
CREATE INDEX IF NOT EXISTS idx_files_zona_active_created
    ON public.files (zona_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- 1.7 files: filter kategori
CREATE INDEX IF NOT EXISTS idx_files_active_category
    ON public.files (category, created_at DESC)
    WHERE deleted_at IS NULL;


-- ============================================================
-- BAGIAN 2: TRIGGER PENJAGA STATUS FILE (x/3, x/2)
-- ============================================================
-- PENTING: file CREATE_TRIGGER_FUNCTION.sql di repo memakai
-- "CREATE TRIGGER IF NOT EXISTS" -> itu sintaks MySQL, TIDAK valid di
-- PostgreSQL -> trigger itu kemungkinan besar PERNAH TERBUAT.
-- Akibatnya files_uploaded_count hanya/rawan dihitung trigger invoice_files,
-- dan saat file dihapus (path dikosongkan) trigger itu tidak menyalakan ->
-- status file jadi tidak akurat.
--
-- Di bawah ini trigger dibuat dengan sintaks PostgreSQL yang benar
-- (DROP IF EXISTS + CREATE) dan fungsinya dibuat case-insensitive
-- (keterangan 'ppn' tetap dianggap PPN).

-- 2.1 Fungsi: hitung dari kolom path (invoice_file_list)
CREATE OR REPLACE FUNCTION public.update_invoice_files_count()
RETURNS TRIGGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_required INTEGER := 2;
    v_keterangan TEXT;
BEGIN
    v_keterangan := UPPER(TRIM(COALESCE(NEW.keterangan, '')));

    IF NEW.invoice_pdf_path IS NOT NULL THEN
        v_count := v_count + 1;
    END IF;
    IF NEW.bukti_bayar_path IS NOT NULL THEN
        v_count := v_count + 1;
    END IF;
    IF NEW.faktur_pajak_path IS NOT NULL THEN
        v_count := v_count + 1;
    END IF;

    -- PPN butuh 3 file (Invoice PDF + Bukti Bayar + Faktur Pajak)
    -- NON butuh 2 file (Invoice PDF + Bukti Bayar)
    IF v_keterangan = 'PPN' THEN
        v_required := 3;
    ELSE
        v_required := 2;
    END IF;

    NEW.files_uploaded_count := v_count;
    NEW.files_required_count := v_required;
    NEW.updated_at := NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2.2 Fungsi: hitung dari tabel invoice_files
CREATE OR REPLACE FUNCTION public.update_invoice_file_count()
RETURNS TRIGGER AS $$
DECLARE
    v_count INTEGER;
    v_required INTEGER;
    v_keterangan TEXT;
    v_faktur VARCHAR(50);
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_faktur := OLD.faktur;
    ELSE
        v_faktur := NEW.faktur;
    END IF;

    SELECT COUNT(DISTINCT file_type) INTO v_count
    FROM public.invoice_files
    WHERE faktur = v_faktur;

    SELECT UPPER(TRIM(COALESCE(keterangan, ''))) INTO v_keterangan
    FROM public.invoice_file_list
    WHERE faktur = v_faktur;

    IF v_keterangan = 'PPN' THEN
        v_required := 3;
    ELSE
        v_required := 2;
    END IF;

    UPDATE public.invoice_file_list
    SET files_uploaded_count = v_count,
        files_required_count = v_required,
        updated_at = NOW()
    WHERE faktur = v_faktur;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2.3 Trigger di invoice_file_list (dihitung dari kolom path)
DROP TRIGGER IF EXISTS trigger_update_invoice_files_count ON public.invoice_file_list;

CREATE TRIGGER trigger_update_invoice_files_count
    BEFORE INSERT OR UPDATE OF invoice_pdf_path, bukti_bayar_path, faktur_pajak_path, keterangan
    ON public.invoice_file_list
    FOR EACH ROW
    EXECUTE FUNCTION public.update_invoice_files_count();

-- 2.4 Trigger di invoice_files (dihitung dari record file)
DROP TRIGGER IF EXISTS trigger_update_file_count ON public.invoice_files;

CREATE TRIGGER trigger_update_file_count
    AFTER INSERT OR UPDATE OR DELETE ON public.invoice_files
    FOR EACH ROW
    EXECUTE FUNCTION public.update_invoice_file_count();


-- ============================================================
-- BAGIAN 3: INDEX UNIK invoice_files (anti duplikat record file)
-- ============================================================
-- Dipakai saat upload: satu faktur + satu tipe file = satu record.
-- Aman: script ini MEMERIKSA dulu apakah ada duplikat.
-- Kalau ada duplikat, index TIDAK dibuat (dicek lewat BAGIAN 4).
DO $$
DECLARE
    v_dupes BIGINT;
BEGIN
    SELECT COUNT(*) INTO v_dupes
    FROM (
        SELECT faktur, file_type
        FROM public.invoice_files
        GROUP BY faktur, file_type
        HAVING COUNT(*) > 1
    ) d;

    IF v_dupes = 0 THEN
        EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_files_faktur_type
                 ON public.invoice_files (faktur, file_type)';
        RAISE NOTICE 'Index unik invoice_files dibuat.';
    ELSE
        RAISE WARNING 'Ada % baris duplikat di invoice_files - index unik TIDAK dibuat. Periksa dulu (BAGIAN 4).', v_dupes;
    END IF;
END $$;


-- ============================================================
-- BAGIAN 4: SINKRONISASI DATA STATUS FILE YANG SUDAH SALAH
-- ============================================================
-- Menghitung ulang files_uploaded_count / files_required_count untuk SEMUA
-- invoice, memakai aturan yang SAMA dengan aplikasi:
--   count    = jumlah TIPE file yang ada
--              (kolom path terisi ATAU ada record di invoice_files)
--   required = 3 bila keterangan PPN, 2 bila NON
--
-- Aman: hanya mengubah 2 kolom status (bukan data invoice/files).
-- SQL yang sama tersedia sebagai endpoint rekonsiliasi:
--   POST /api/invoice/reconcile-file-status  { "verify_r2": false }
--
WITH per_type AS (
    SELECT
        ifl.faktur,
        (CASE WHEN ifl.invoice_pdf_path IS NOT NULL
                    OR EXISTS (SELECT 1 FROM public.invoice_files f
                               WHERE f.faktur = ifl.faktur AND f.file_type = 'invoice')
              THEN 1 ELSE 0 END)
      + (CASE WHEN ifl.bukti_bayar_path IS NOT NULL
                    OR EXISTS (SELECT 1 FROM public.invoice_files f
                               WHERE f.faktur = ifl.faktur AND f.file_type = 'bukti_bayar')
              THEN 1 ELSE 0 END)
      + (CASE WHEN ifl.faktur_pajak_path IS NOT NULL
                    OR EXISTS (SELECT 1 FROM public.invoice_files f
                               WHERE f.faktur = ifl.faktur AND f.file_type = 'faktur_pajak')
              THEN 1 ELSE 0 END) AS new_count,
        CASE WHEN UPPER(TRIM(COALESCE(ifl.keterangan, ''))) = 'PPN' THEN 3 ELSE 2 END AS new_required
    FROM public.invoice_file_list ifl
)
UPDATE public.invoice_file_list ifl
SET files_uploaded_count = per_type.new_count,
    files_required_count = per_type.new_required,
    updated_at = NOW()
FROM per_type
WHERE ifl.faktur = per_type.faktur
  AND (ifl.files_uploaded_count IS DISTINCT FROM per_type.new_count
       OR ifl.files_required_count IS DISTINCT FROM per_type.new_required);


-- ============================================================
-- BAGIAN 5: VERIFIKASI (hanya baca)
-- ============================================================

-- 4.1 Trigger apa saja yang sudah aktif
SELECT
    trigger_name,
    event_manipulation,
    event_object_table,
    action_timing
FROM information_schema.triggers
WHERE trigger_name IN ('trigger_update_file_count', 'trigger_update_invoice_files_count')
ORDER BY event_object_table;

-- 4.2 Index yang baru dibuat
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_invoice_file_list_zona_tanggal',
    'idx_invoice_file_list_tanggal',
    'idx_invoice_file_list_keterangan',
    'idx_invoice_file_list_files_missing',
    'idx_files_active_created',
    'idx_files_zona_active_created',
    'idx_files_active_category',
    'idx_invoice_files_faktur_type'
  )
ORDER BY indexname;

-- 4.3 Ada duplikat di invoice_files? (kalau > 0, index unik belum dibuat)
SELECT faktur, file_type, COUNT(*) AS jumlah
FROM public.invoice_files
GROUP BY faktur, file_type
HAVING COUNT(*) > 1
ORDER BY jumlah DESC
LIMIT 20;

-- 4.4 Ringkasan status file saat ini
SELECT
    COUNT(*) AS total_invoice,
    COUNT(*) FILTER (WHERE files_uploaded_count = files_required_count) AS status_lengkap,
    COUNT(*) FILTER (WHERE files_uploaded_count <> files_required_count) AS status_tidak_lengkap,
    COUNT(*) FILTER (WHERE files_required_count IS NULL OR files_required_count = 0) AS required_kosong
FROM public.invoice_file_list;

-- 4.5 Contoh invoice yang statusnya berbeda antara kolom cache & kolom path
SELECT
    faktur,
    keterangan,
    files_uploaded_count AS status_db,
    files_required_count AS required_db,
    (CASE WHEN invoice_pdf_path IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN bukti_bayar_path IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN faktur_pajak_path IS NOT NULL THEN 1 ELSE 0 END) AS status_dari_path
FROM public.invoice_file_list
WHERE files_uploaded_count <> (
        CASE WHEN invoice_pdf_path IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN bukti_bayar_path IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN faktur_pajak_path IS NOT NULL THEN 1 ELSE 0 END
     OR files_required_count IS NULL
     OR files_required_count = 0
LIMIT 20;
