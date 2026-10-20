# Perbaikan Sistem Upload Excel

**Tanggal:** 20 Oktober 2026
**Status:** Selesai diimplementasikan, siap deploy
**File baru:** `js/excel-utils.js`, `backend/__tests__/excel-utils.test.js`
**File berubah:** `backend/invoice-endpoints.js`, `backend/excel-parser.js`, `js/upload-excel.js`, `js/invoice-list.js`, `js/invoice-batches.js`, `upload-excel.html`, `upload.html`

---

## 1. Flow Upload Excel (setelah perbaikan)

```
[1] Pilih file .xlsx (≤10 MB)                    upload-excel.html
        ▼
[2] PARSE DI BROWSER (SheetJS)                   js/upload-excel.js
        │  • sheet "REKAP" + deteksi baris header (cari "TANGGAL")
        │  • NORMALISASI via ExcelUtils (bersama server):
        │      tanggal → YYYY-MM-DD (Date/ISO/DD-MM-YYYY/DD/MM/YYYY/serial)
        │      nominal → number ("1.234,56" → 1234.56)
        │      toko    → ANKA BEKASI / ANKA PEMALANG / nama toko asli
        │  • retur dilewati, agregasi per faktur
        ▼
[3] CEK DUPLIKAT ke database (1 request per 500 faktur)   ← BARU
        │  → tampil: "N faktur sudah ada (tidak diupload ulang)"
        ▼
[4] POST /api/invoice/upload-excel-data (JSON)   invoice-endpoints.js
        ▼
[5] SERVER
        │  a. validasi per baris → yang invalid DITOLAK & dilaporkan
        │  b. cek duplikat (1 query per 100 faktur) → pisahkan baru vs duplikat
        │  c. baca tabel toko SEKALI → Map (fix N+1)
        │  d. insert per chunk 500 baris (+ fallback per baris bila bentrok)
        │  e. update batch: status mencerminkan hasil sebenarnya
        ▼
[6] Response rinci: processed / duplicates / rejected (+ alasan) / failed
```

---

## 2. Temuan yang Diperbaiki

### 🔴 Critical

| # | Temuan | Perbaikan |
|---|---|---|
| **C1** | **Tanggal rusak** jika sel Excel bertipe DATE → tersimpan `15T00:00:00.000Z-08-2026`. Format lain pun salah (`2026-08-15` → terbalik, `15/08/2026` → diam-diam jadi hari ini) | `ExcelUtils.normalizeExcelDate()` dipakai di browser **dan** server. Semua format → `YYYY-MM-DD`. Tanggal tidak valid → **baris ditolak & dilaporkan** (bukan diam-diam jadi hari ini) |
| **C2** | **Insert all-or-nothing**: 1 duplikat → seluruh batch hilang & dilaporkan "semua duplikat" | Duplikat difilter **sebelum** insert + fallback insert per baris bila tetap bentrok. Data baru selalu masuk |
| **C3** | **Tidak ada cek duplikat** sebelum upload (komentar di kode sempat menyebut sudah ada, padahal tidak) | Frontend memanggil `/api/invoice/check-duplicate-fakturs` → jumlah faktur yang sudah ada ditampilkan **sebelum** upload |
| **C4** | **N+1 query**: 1 query ke tabel `toko` per baris (1.000 baris = 1.000 query serentak) | Tabel `toko` dibaca **SEKALI** → Map di memori. 1.000 baris: 1.000 query → **1 query** |
| **C5** | **Hapus invoice / hapus batch** tidak membersihkan `invoice_files` (dan hapus batch tidak menghapus file R2) → status file ngawur & upload ulang jadi "Duplicate" | Hapus invoice → record `invoice_files` ikut dibersihkan. Hapus batch → **file R2 ikut dihapus (dengan konfirmasi)** + record `invoice_files` dibersihkan |

### 🟠 High

| # | Temuan | Perbaikan |
|---|---|---|
| **H1** | Transaksi **RETUR ikut terimport** di halaman legacy (`upload.html`) | Filter retur sekarang berlaku di **kedua** halaman |
| **H2** | Dua halaman upload dengan aturan berbeda | Aturan inti (tanggal, nominal, toko, retur, agregasi) sekarang **satu implementasi** dipakai keduanya (Halaman legacy tetap ada, sesuai keputusan) |
| **H3** | Tidak ada validasi field (faktur non-angka, tanggal/toko kosong tetap masuk) | Validasi per baris: faktur kosong/non-angka, tanggal kosong, toko kosong → **ditolak & dilaporkan** (nama faktur + alasannya) |
| **H5** | `populate-zona-ids` (alat perbaikan) cocokkan `toko` case-sensitive → praktis tidak pernah berhasil | Aturan yang **sama** dengan upload: baca `toko` sekali, cocokkan KONSUMEN dulu lalu TOKO (case-insensitive) |
| **H7** | Insert 1 statement untuk semua baris → file besar bisa gagal total | Insert per chunk 500 baris + fallback per baris |

> **H4 & H6** (normalisasi `keterangan` legacy & pengisian `toko_id` yang kosong) **sengaja tidak diubah** — sesuai keputusan Anda: biarkan saja. Keduanya butuh migrasi data, bukan perbaikan kode. Bila suatu saat diperlukan, tinggal jalankan:
> ```sql
> UPDATE invoice_file_list SET keterangan = 'NON' WHERE UPPER(keterangan) = 'NON_PPN';
> UPDATE invoice_file_list SET toko_id = t.id FROM toko t
>   WHERE lower(trim(t.nama)) = lower(trim(invoice_file_list.konsumen)) AND invoice_file_list.toko_id IS NULL;
> ```

### 🟡 Medium (sesuai permintaan)

| # | Temuan | Perbaikan |
|---|---|---|
| **M1** | `parseFloat("1.234,56")` → **1.234** (nominal salah) | `ExcelUtils.parseNominal()` mendukung format Indonesia & Inggris |
| **M3** | Parser server (`excel-parser.js`) **di-bypass** & bisa berbeda dari parser browser | **Satu sumber kebenaran:** `js/excel-utils.js` (UMD) dipakai browser, server, **dan** unit test. `excel-parser.js` kini memakai utilitas yang sama |
| **M4** | Batch berstatus `completed` padahal 0 baris masuk | Status batch: `completed` / `completed_with_errors` / `failed` sesuai hasil sebenarnya |
| **M6** | Upload ulang file yang sama → batch baru + gagal total | Upload ulang jadi **no-op**: 0 baris baru → tidak ada batch dibuat, laporan "semua faktur sudah ada" |

---

## 3. Bukti Perbaikan (terbukti otomatis)

### Tanggal (kasus yang sebelumnya merusak data)

```
✅ DATE CELL (15/08/2026)   browser -> 2026-08-15 | server -> 2026-08-15
✅ TEXT "15-08-2026"        browser -> 2026-08-15 | server -> 2026-08-15
✅ TEXT "2026-08-15"        browser -> 2026-08-15 | server -> 2026-08-15
✅ TEXT "15/08/2026"        browser -> 2026-08-15 | server -> 2026-08-15
✅ TANGGAL KOSONG          browser -> null        | server -> (DITOLAK: Tanggal kosong)
```

### Test otomatis

```bash
cd backend && npx jest __tests__/excel-utils.test.js __tests__/invoice-file-status.test.js
```
→ **45 test, 45 lulus** (27 untuk ExcelUtils + 18 untuk status file)

`query-optimizer.test.js`: baseline **6 pass / 7 fail** → sekarang **7 pass / 6 fail** (1 diperbaiki, tanpa regresi).

---

## 4. Deploy

```bash
cd /var/www/arsipdigitalr2
git pull origin master
pm2 restart arsip-backend
```

Tidak ada migrasi database. Hard refresh browser (Ctrl+Shift+R) — `js/excel-utils.js` adalah file baru.

---

## 5. Checklist Test

- [ ] Upload Excel 1.000 baris (semua faktur baru) → 1.000 tersimpan, selesai jauh lebih cepat (1 query `toko`, bukan 1.000)
- [ ] Upload Excel dengan **1 faktur yang sudah ada** + 999 baru → **999 masuk, 1 dilaporkan sebagai duplikat** (bukan semua gagal)
- [ ] Upload Excel dengan sel tanggal bertipe **DATE** → tanggal `2026-08-15`, folder R2 benar
- [ ] Upload Excel dengan format `DD/MM/YYYY` & `YYYY-MM-DD` → sama-sama benar
- [ ] Upload Excel dengan **tanggal kosong / faktur non-angka / toko kosong** → baris ditolak, muncul di laporan + alasan
- [ ] Upload Excel berisi **RETUR** → tidak masuk (halaman utama **dan** legacy)
- [ ] Upload Excel 5.000+ baris → tidak gagal total
- [ ] Upload Excel yang sama 2× → yang kedua: 0 baru, N duplikat, tidak bikin batch baru
- [ ] Upload → hapus batch (**pilih "hapus file di storage"**) → upload ulang Excel yang sama → **berhasil**
- [ ] Upload → hapus 1 invoice → status file invoice tsb jadi 0/2 atau 0/3 (bukan 3/3)
- [ ] Nominal "1.234,56" → tersimpan 1234.56
- [ ] Halaman `/upload` (legacy) → retur tetap tidak terimport

---

## 6. Rollback

```bash
git checkout HEAD~1 -- js/excel-utils.js js/upload-excel.js js/invoice-list.js \
  js/invoice-batches.js backend/excel-parser.js backend/invoice-endpoints.js \
  upload-excel.html upload.html backend/__tests__/excel-utils.test.js
pm2 restart arsip-backend
```

Tidak ada perubahan skema/data. Data yang sudah terimport dengan versi lama tidak perlu
di-rollback (tanggalnya bisa diperbaiki dengan
`POST /api/invoice/reconcile-file-status` atau upload ulang setelah hapus batch).

---

## 7. Catatan

- **M2** (`total_rows` di record batch = jumlah faktur agregat, bukan jumlah baris asli) dan
  **M5** (tanpa batas baris di browser) **tidak** dikerjakan — di luar daftar yang disetujui.
- **H4 & H6** tidak dikerjakan sesuai keputusan Anda (butuh migrasi data) — SQL siap di
  section 2 bila suatu saat diperlukan.
- Halaman legacy `upload.html` **tetap ada** sesuai keputusan Anda, hanya alur parsing-nya
  disamakan (retur + tanggal + nominal).
