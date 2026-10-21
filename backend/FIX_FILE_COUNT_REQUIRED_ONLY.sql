-- =====================================================================
-- FIX: Hitungan status file (x/3, x/2) hanya menghitung file WAJIB
-- =====================================================================
-- MASALAH:
--   files_uploaded_count dihitung dari SEMUA 3 tipe file, padahal untuk
--   invoice NON PPN hanya 2 file yang wajib (Invoice PDF + Bukti Bayar).
--   File "Faktur Pajak" sisa pada invoice NON ikut terhitung ->
--   invoice tanpa Invoice PDF tetap terlihat "lengkap" (2/2).
--
--   Contoh nyata (hasil diagnosa):
--     835100310010126011 : invoice_pdf_path NULL, bukti_bayar_path ada,
--                           faktur_pajak_path ada (sisa) -> tampil 2/2
--                           padahal faktanya 1/2 (Invoice PDF belum ada)
--     835100310021026005 : invoice_pdf_path ada, bukti_bayar_path NULL,
--                           faktur_pajak_path ada (sisa) -> tampil 2/2
--                           padahal faktanya 1/2 (Bukti Bayar belum ada)
--
-- ATURAN BARU (sama dengan aplikasi & dengan modul js/invoice-table-utils.js):
--   PPN  -> wajib: invoice + bukti bayar + faktur pajak (3)
--   NON -> wajib: invoice + bukti bayar (2)
--   "ada" = kolom path terisi ATAU ada record di invoice_files
--   file di luar daftar wajib TIDAK dihitung
--
-- AMAN:
--   - hanya mengubah 2 kolom status (files_uploaded_count &
--     files_required_count) + trigger
--   - tidak menghapus / mengubah data invoice maupun file
--   - idempotent: boleh dijalankan berulang kali
--
-- CARA PAKAI: Supabase > SQL Editor > New query > tempel > Run
-- =====================================================================


-- ---------------------------------------------------------------------
-- BAGIAN 1: Trigger di invoice_file_list (dipanggil saat kolom path berubah)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_invoice_files_count()
RETURNS TRIGGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_required INTEGER := 2;
    v_keterangan TEXT;
    v_has_invoice BOOLEAN := FALSE;
    v_has_bukti BOOLEAN := FALSE;
    v_has_faktur BOOLEAN := FALSE;
BEGIN
    v_keterangan := UPPER(TRIM(COALESCE(NEW.keterangan, '')));
    v_required := CASE WHEN v_keterangan = 'PPN' THEN 3 ELSE 2 END;

    -- Sumber: record invoice_files (file yang tercatat)
    SELECT
        COALESCE(BOOL_OR(file_type = 'invoice'), FALSE),
        COALESCE(BOOL_OR(file_type = 'bukti_bayar'), FALSE),
        COALESCE(BOOL_OR(file_type = 'faktur_pajak'), FALSE)
    INTO v_has_invoice, v_has_bukti, v_has_faktur
    FROM public.invoice_files
    WHERE faktur = NEW.faktur;

    -- Sumber: kolom path (file yang terisi)
    v_has_invoice := v_has_invoice
        OR (COALESCE(NEW.invoice_pdf_path, '') <> '')
        OR (COALESCE(NEW.uploaded_file_path, '') <> '');
    v_has_bukti := v_has_bukti
        OR (COALESCE(NEW.bukti_bayar_path, '') <> '');
    v_has_faktur := v_has_faktur
        OR (COALESCE(NEW.faktur_pajak_path, '') <> '');

    -- HANYA file wajib yang dihitung
    IF v_has_invoice THEN
        v_count := v_count + 1;
    END IF;
    IF v_has_bukti THEN
        v_count := v_count + 1;
    END IF;
    IF v_required = 3 AND v_has_faktur THEN
        v_count := v_count + 1;
    END IF;

    NEW.files_uploaded_count := v_count;
    NEW.files_required_count := v_required;
    NEW.updated_at := NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------------------
-- BAGIAN 2: Trigger di invoice_files (dipanggil saat record file berubah)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_invoice_file_count()
RETURNS TRIGGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_required INTEGER := 2;
    v_keterangan TEXT;
    v_faktur VARCHAR(50);
    v_has_invoice BOOLEAN := FALSE;
    v_has_bukti BOOLEAN := FALSE;
    v_has_faktur BOOLEAN := FALSE;
    v_invoice_path TEXT := '';
    v_uploaded_path TEXT := '';
    v_bukti_path TEXT := '';
    v_faktur_path TEXT := '';
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_faktur := OLD.faktur;
    ELSE
        v_faktur := NEW.faktur;
    END IF;

    -- Sumber: record invoice_files
    SELECT
        COALESCE(BOOL_OR(file_type = 'invoice'), FALSE),
        COALESCE(BOOL_OR(file_type = 'bukti_bayar'), FALSE),
        COALESCE(BOOL_OR(file_type = 'faktur_pajak'), FALSE)
    INTO v_has_invoice, v_has_bukti, v_has_faktur
    FROM public.invoice_files
    WHERE faktur = v_faktur;

    -- Sumber: kolom path
    SELECT
        UPPER(TRIM(COALESCE(keterangan, ''))),
        COALESCE(invoice_pdf_path, ''),
        COALESCE(uploaded_file_path, ''),
        COALESCE(bukti_bayar_path, ''),
        COALESCE(faktur_pajak_path, '')
    INTO v_keterangan, v_invoice_path, v_uploaded_path, v_bukti_path, v_faktur_path
    FROM public.invoice_file_list
    WHERE faktur = v_faktur;

    v_required := CASE WHEN v_keterangan = 'PPN' THEN 3 ELSE 2 END;

    v_has_invoice := v_has_invoice OR (v_invoice_path <> '') OR (v_uploaded_path <> '');
    v_has_bukti := v_has_bukti OR (v_bukti_path <> '');
    v_has_faktur := v_has_faktur OR (v_faktur_path <> '');

    -- HANYA file wajib yang dihitung
    IF v_has_invoice THEN
        v_count := v_count + 1;
    END IF;
    IF v_has_bukti THEN
        v_count := v_count + 1;
    END IF;
    IF v_required = 3 AND v_has_faktur THEN
        v_count := v_count + 1;
    END IF;

    UPDATE public.invoice_file_list
    SET files_uploaded_count = v_count,
        files_required_count = v_required,
        updated_at = NOW()
    WHERE faktur = v_faktur;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------------------
-- BAGIAN 3: Pasang ulang trigger (dengan sintaks PostgreSQL yang benar)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_update_invoice_files_count ON public.invoice_file_list;
CREATE TRIGGER trigger_update_invoice_files_count
    BEFORE UPDATE ON public.invoice_file_list
    FOR EACH ROW
    EXECUTE FUNCTION public.update_invoice_files_count();

DROP TRIGGER IF EXISTS trigger_update_file_count ON public.invoice_files;
CREATE TRIGGER trigger_update_file_count
    AFTER INSERT OR UPDATE OR DELETE ON public.invoice_files
    FOR EACH ROW
    EXECUTE FUNCTION public.update_invoice_file_count();


-- ---------------------------------------------------------------------
-- BAGIAN 4: Sinkronisasi ULANG semua baris (hanya 2 kolom status)
-- ---------------------------------------------------------------------
-- count_baru = hanya file WAJIB yang ada
--             (PPN: invoice+bukti+faktur, NON: invoice+bukti)
-- "ada"     = kolom path terisi ATAU ada record di invoice_files
WITH per_type AS (
    SELECT
        ifl.faktur,
        (CASE WHEN UPPER(TRIM(COALESCE(ifl.keterangan, ''))) = 'PPN'
               THEN
                   (CASE WHEN COALESCE(ifl.invoice_pdf_path, '') <> ''
                              OR COALESCE(ifl.uploaded_file_path, '') <> ''
                              OR EXISTS (SELECT 1 FROM public.invoice_files f
                                         WHERE f.faktur = ifl.faktur AND f.file_type = 'invoice')
                         THEN 1 ELSE 0 END)
                 + (CASE WHEN COALESCE(ifl.bukti_bayar_path, '') <> ''
                              OR EXISTS (SELECT 1 FROM public.invoice_files f
                                         WHERE f.faktur = ifl.faktur AND f.file_type = 'bukti_bayar')
                         THEN 1 ELSE 0 END)
                 + (CASE WHEN COALESCE(ifl.faktur_pajak_path, '') <> ''
                              OR EXISTS (SELECT 1 FROM public.invoice_files f
                                         WHERE f.faktur = ifl.faktur AND f.file_type = 'faktur_pajak')
                         THEN 1 ELSE 0 END)
               ELSE
                   (CASE WHEN COALESCE(ifl.invoice_pdf_path, '') <> ''
                              OR COALESCE(ifl.uploaded_file_path, '') <> ''
                              OR EXISTS (SELECT 1 FROM public.invoice_files f
                                         WHERE f.faktur = ifl.faktur AND f.file_type = 'invoice')
                         THEN 1 ELSE 0 END)
                 + (CASE WHEN COALESCE(ifl.bukti_bayar_path, '') <> ''
                              OR EXISTS (SELECT 1 FROM public.invoice_files f
                                         WHERE f.faktur = ifl.faktur AND f.file_type = 'bukti_bayar')
                         THEN 1 ELSE 0 END)
          END) AS new_count,
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


-- ---------------------------------------------------------------------
-- BAGIAN 5: VERIFIKASI (hanya baca)
-- ---------------------------------------------------------------------
-- 5.1 Distribusi status setelah perbaikan
SELECT files_uploaded_count || '/' || files_required_count AS status,
       count(*) AS jumlah
FROM public.invoice_file_list
GROUP BY files_uploaded_count, files_required_count
ORDER BY files_required_count DESC, files_uploaded_count DESC;

-- 5.2 Berapa baris yang terlihat "lengkap" (sebelum 102, sesudahnya
--     diharapkan turun 2 karena 2 faktur itu memang tidak lengkap)
SELECT count(*) FILTER (WHERE files_uploaded_count >= files_required_count) AS lengkap,
       count(*) FILTER (WHERE files_uploaded_count <  files_required_count) AS belum_lengkap,
       count(*) AS total
FROM public.invoice_file_list;

-- 5.3 Cek 2 faktur yang jadi attention (hasilnya harus 1/2, bukan 2/2)
SELECT faktur, keterangan,
       (invoice_pdf_path IS NOT NULL OR uploaded_file_path IS NOT NULL) AS ada_invoice,
       (bukti_bayar_path IS NOT NULL) AS ada_bukti_bayar,
       (faktur_pajak_path IS NOT NULL) AS ada_faktur_pajak,
       files_uploaded_count, files_required_count
FROM public.invoice_file_list
WHERE faktur IN ('835100310010126011', '835100310021026005');
