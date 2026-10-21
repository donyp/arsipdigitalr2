-- =====================================================================
-- DIAGNOSIS: Tombol "Invoice" hilang & Combine salah unduh
-- Faktur contoh: 835100310010126011
-- =====================================================================
-- CARA PAKAI:
--   1. Buka Supabase > SQL Editor > New query
--   2. Tempel SELURUH isi file ini
--   3. Klik Run (Run dapat dijalankan per blok query)
--   4. Copy-paste hasilnya ke chat
--
-- CATATAN: semua query di bawah READ-ONLY (SELECT) - tidak mengubah data.
-- =====================================================================


-- ---------------------------------------------------------------------
-- D1: DATA BARIS INVOICE (isi path & hitungan file)
-- ---------------------------------------------------------------------
SELECT
    faktur,
    keterangan,
    zona_id,
    invoice_pdf_path,
    uploaded_file_path,
    bukti_bayar_path,
    faktur_pajak_path,
    files_uploaded_count,
    files_required_count,
    created_at,
    updated_at
FROM public.invoice_file_list
WHERE faktur = '835100310010126011';


-- ---------------------------------------------------------------------
-- D2: RECORD invoice_files (tabel penanda file per tipe)
--     - kalau ADA row file_type='invoice' -> file invoice tercatat tapi
--       kolom path-nya kosong (file yatim, bisa diperbaiki otomatis)
--     - kalau TIDAK ADA -> invoice memang tidak pernah tercatat
-- ---------------------------------------------------------------------
SELECT
    faktur,
    file_type,
    file_path,
    created_at
FROM public.invoice_files
WHERE faktur = '835100310010126011'
ORDER BY file_type;


-- ---------------------------------------------------------------------
-- D3: BERAPA BANYAK BARIS "TERLIHAT LENGKAP" PADAHAL INVOICE PDF-NYA KOSONG
--     (pola yang sama seperti faktur contoh, di seluruh database)
-- ---------------------------------------------------------------------
SELECT
    count(*) AS baris_tanpa_invoice_pdf,
    count(*) FILTER (WHERE files_uploaded_count >= files_required_count) AS terlihat_lengkap,
    count(*) FILTER (WHERE files_uploaded_count <  files_required_count) AS terlihat_belum_lengkap
FROM public.invoice_file_list
WHERE COALESCE(invoice_pdf_path, '') = ''
  AND COALESCE(uploaded_file_path, '') = '';


-- ---------------------------------------------------------------------
-- D4: POLA "FAKTUR PAJAK SISA" PADA INVOICE NON
--     (file tak wajib ikut terhitung -> bikin invoice tanpa invoice PDF
--      terlihat "lengkap")
-- ---------------------------------------------------------------------
SELECT
    count(*) AS invoice_non_ppn_yang_punya_faktur_pajak,
    count(*) FILTER (WHERE files_uploaded_count >= files_required_count) AS yang_terlihat_lengkap
FROM public.invoice_file_list
WHERE UPPER(TRIM(COALESCE(keterangan, ''))) <> 'PPN'
  AND COALESCE(faktur_pajak_path, '') <> '';


-- ---------------------------------------------------------------------
-- D5: SEBERAPA BANYAK BARIS YANG AKAN BERUBAH SETELAH ATURAN HITUNG DIPERBAIKI
--     count_baru = hanya file WAJIB yang dihitung
--                 (PPN: invoice+bukti+faktur, NON: invoice+bukti)
-- ---------------------------------------------------------------------
WITH per_row AS (
    SELECT
        faktur,
        files_uploaded_count,
        files_required_count,
        (CASE WHEN UPPER(TRIM(COALESCE(keterangan, ''))) = 'PPN' THEN 3 ELSE 2 END) AS wajib,
        (CASE WHEN COALESCE(invoice_pdf_path, '') <> '' OR COALESCE(uploaded_file_path, '') <> '' THEN 1 ELSE 0 END)
      + (CASE WHEN COALESCE(bukti_bayar_path, '') <> '' THEN 1 ELSE 0 END)
      + (CASE WHEN UPPER(TRIM(COALESCE(keterangan, ''))) = 'PPN' AND COALESCE(faktur_pajak_path, '') <> '' THEN 1 ELSE 0 END)
            AS count_baru
    FROM public.invoice_file_list
)
SELECT
    count(*) AS total_baris,
    count(*) FILTER (WHERE count_baru <> files_uploaded_count) AS count_akan_berubah,
    count(*) FILTER (
        WHERE count_baru < wajib
          AND files_uploaded_count >= wajib
    ) AS dari_terlihat_lengkap_jadi_belum_lengkap,
    count(*) FILTER (
        WHERE count_baru >= wajib
          AND files_uploaded_count < wajib
    ) AS dari_terlihat_belum_jadi_lengkap
FROM per_row;


-- ---------------------------------------------------------------------
-- D6: FILE YATIM DI invoice_files (file tercatat, tapi kolom path kosong)
--     - kalau jumlahnya besar, rekonsiliasi (backfill) bisa memperbaiki
--     - kalau 0, berarti tabel invoice_files tidak bisa jadi acuan
-- ---------------------------------------------------------------------
SELECT
    count(*) AS faktur_dengan_file_invoice_tanpa_kolom_path
FROM public.invoice_files f
JOIN public.invoice_file_list l ON l.faktur = f.faktur
WHERE f.file_type = 'invoice'
  AND COALESCE(l.invoice_pdf_path, '') = ''
  AND COALESCE(l.uploaded_file_path, '') = '';
