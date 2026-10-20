# Perbaikan Akurasi Status File Invoice (0/3, 1/3, 2/3, 3/3)

**Tanggal:** 20 Oktober 2026
**Status:** Selesai diimplementasikan, siap deploy
**File baru:** `backend/invoice-file-status.js`, `backend/file-status-reconciler.js`, `backend/file-status-sync-job.js`, `backend/__tests__/invoice-file-status.test.js`
**File berubah:** `backend/invoice-endpoints.js`, `backend/storage-handler-endpoints.js`, `backend/query-optimizer.js`, `backend/server.js`, `backend/invoice-upload-helper.js`, `js/dashboard.js`, `dashboard-admin-zona.html`, `.env.example`

---

## 1. Gejala yang Dilaporkan

Badge status file (`0/3`, `1/3`, `2/3`, `3/3`) sering tidak akurat — terutama setelah
**upload file** atau **hapus file dari R2 / Storage Handler**. Status ini yang menentukan
**muncul/tidaknya tombol download** (Invoice PDF, Bukti Bayar, Faktur Pajak) di
dashboard utama maupun dashboard admin zona.

Aturan yang dipakai:

| Tipe invoice | Jumlah file yang dibutuhkan | Status |
|---|---|---|
| **PPN** | 3 → Invoice PDF + Bukti Bayar + Faktur Pajak | 0/3 … 3/3 |
| **NON** | 2 → Invoice PDF + Bukti Bayar | 0/2 … 2/2 |

---

## 2. Akar Masalah (6 temuan)

| # | Temuan | Bukti |
|---|---|---|
| **A1** | **Hitungan file punya 3 sumber kebenaran** yang saling menimpa: trigger DB di `invoice_files` (COUNT DISTINCT file_type), trigger DB di `invoice_file_list` (jumlah kolom path terisi), dan kode aplikasi. Jika `invoice_files` punya baris tapi kolom path masih NULL, keduanya menulis angka berbeda → status naik-turun sendiri. | `CREATE_FILE_COUNT_TRIGGER.sql`, `CREATE_TRIGGER_FUNCTION.sql`, `invoice-endpoints.js` |
| **A2** | **Hapus file dari Storage Handler tidak pernah menyentuh database.** `updateInvoiceFileCountAfterDelete()` hanya jalan bila path mengandung `'INVOICE'`, padahal path invoice sekarang `ARSIP/{lokasi}/{PPN\|NON}/...` → **selalu return di baris pertama**. Hapus folder (recursive) **tidak memanggil** fungsi ini sama sekali. Fungsi itu juga tidak mengosongkan kolom path dan tidak menghapus baris `invoice_files`. | `storage-handler-endpoints.js:54`, `:680-720` |
| **A3** | **"Hapus file" dari dashboard** (`clear-file`) mengosongkan kolom path & menulis count manual, tapi **baris `invoice_files` tetap ada** → trigger DB menghitung file yang sudah dihapus lagi → **count naik kembali** saat file lain diunggah. | `invoice-endpoints.js:4064-4119` |
| **A4** | **Semua alat perbaikan/sinkronisasi rusak:**<br>• `query-optimizer` query `invoice_files.invoice_id` — **kolom tidak pernah ada** (kuncinya `faktur`) → selalu error<br>• `addManualSyncEndpoint` tidak pernah didaftarkan → endpoint tidak ada<br>• **tidak ada** job/cron rekonsiliasi<br>• `search-existing-files` & `scan-all-invoices` mencari di path lama `ARSIPINVOICE/...` | `query-optimizer.js:101,164,223`, `server.js`, `invoice-endpoints.js:3679,3853` |
| **A5** | **Badge status & tombol download baca sumber berbeda:** badge memakai kolom cache `files_uploaded_count`, tombol memakai kolom path → keduanya bisa berbeda → user lihat "3/3" tapi tombolnya cuma 2. | `dashboard.html`, `dashboard-admin-zona.html` |
| **A6** | `files_required_count` bergantung pada `keterangan` yang dibandingkan case-sensitive di database (`keterangan = 'PPN'`), sementara frontend memakai `.toUpperCase()`. Data legacy `'ppn'` → DB bilang butuh 2, frontend bilang 3. | trigger DB vs `dashboard.js` |

> Catatan: perubahan kemarin (optimasi filter bulan) **membuat kasus "file dihapus dari R2" lebih
> kelihatan** — sebelumnya tombol disembunyikan setelah cek R2 per baris, sekarang tombol
> muncul lalu gagal saat diklik. Perbaikan di bawah mengembalikan akurasi **tanpa** N+1 check.

---

## 3. Yang Diperbaiki

### Fase 1 — Satu sumber kebenaran

`backend/invoice-file-status.js` (baru) — semua pihak memakai definisi yang sama:

```
Untuk tiap tipe file:  ADA  =  (kolom path terisi)  OR  (ada baris di invoice_files)
count   = jumlah tipe yang ADA            (OR per tipe → tidak ada double count)
required= 3 bila keterangan = PPN, selain itu 2
```

- `syncInvoiceFileCount()` (dari tahap upload sebelumnya) **diperbaiki** → memakai helper,
  bukan hanya kolom path. Ini menutup bug yang saya bawa sendiri (count bisa ditulis 0
  padahal filenya ada).
- Trigger database tidak diubah (tanpa perubahan skema) — karena app selalu menulis
  `invoice_files` **dan** kolom path sekaligus, kedua definisi itu otomatis sama.

### Fase 2 — Hapus file selalu merapikan database

| # | Perubahan |
|---|---|
| 2.1 | Hapus file dari Storage Handler → **cocokkan path dengan database** (bukan menebak format path) |
| 2.2 | Lalu: kosongkan kolom path + **hapus baris `invoice_files`** + tulis ulang count/required |
| 2.3 | **Hapus folder (recursive)** → ikut merapikan semua invoice di dalamnya (1 query per kolom path, bukan per file) |
| 2.4 | `clear-file` dari dashboard → **hapus baris `invoice_files`** → count tidak naik lagi |

### Fase 3 — Tombol download & status selalu sinkron

| # | Perubahan |
|---|---|
| 3.1 | **Self-healing saat download:** file tidak ada di R2 → backend otomatis mengosongkan path + menghapus record + memperbarui count → tombol & status benar sendiri setelah refresh (tanpa request per baris) |
| 3.2 | Dashboard utama & admin zona: badge status, filter Lunas/Belum Lunas, dan tombol download dihitung dari **sumber yang sama** (kolom path) |
| 3.3 | Cache download lokal: 24 jam → **1 jam** (env `DOWNLOAD_CACHE_TTL_MINUTES`) + cache ikut dibuang saat file dihapus dari Storage Handler |

> Dashboard admin zona **tetap tanpa badge status** (sesuai permintaan) — hanya perhitungan
> Lunas/Belum Lunas yang disamakan sumbernya.

### Fase 4 — Alat perbaikan & rekonsiliasi

| # | Perubahan |
|---|---|
| 4.1 | `query-optimizer`: `invoice_id` → `faktur` (kolom `invoice_id` tidak pernah ada) |
| 4.2 | `search-existing-files` & `scan-all-invoices` → memakai path builder yang sama dengan upload |
| 4.3 | **Endpoint baru** `POST /api/invoice/reconcile-file-status` (super_admin) |
| 4.4 | **Job berkala** setiap 6 jam (mode DB-only, cepat) + `POST /api/invoice/sync-file-status-now` + `GET /api/invoice/sync-file-status` |
| 4.5 | Normalisasi `keterangan` (kapitalisasi `PPN`/`NON` saja; `NON_PPN` legacy tidak diubah) |

---

## 4. Cara Menjalankan Rekonsiliasi (2 tahap)

### Tahap 1 — cepat & aman (Recommended, boleh kapan saja)

```bash
curl -X POST https://api.arsipdigitalanka.cloud/api/invoice/reconcile-file-status \
  -H "Authorization: Bearer <TOKEN_SUPER_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{"verify_r2": false}'
```
→ Menyamakan count + melengkapi kolom path yang kosong + normalisasi keterangan.
Runtime: hitungan detik untuk ±8.000 invoice.

### Tahap 2 — paling akurat (server sepi, ±10–30 menit)

```bash
curl -X POST https://api.arsipdigitalanka.cloud/api/invoice/reconcile-file-status \
  -H "Authorization: Bearer <TOKEN_SUPER_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{"verify_r2": true}'
```
→ Selain Tahap 1, **setiap file dicek keberadaannya di R2**. File yang sudah hilang →
path dikosongkan, record dihapus, count diperbarui → tombol download hilang dengan benar.

Contoh respons:

```json
{
  "success": true,
  "total": 8248,
  "checked": 8248,
  "skipped": 12,
  "countFixed": 143,
  "pathBackfilled": 87,
  "pathCleared": 21,
  "keteranganNormalized": 5,
  "r2Checked": 20110,
  "r2Missing": 21,
  "errors": 0,
  "durationSeconds": 47
}
```

---

## 5. Deploy

```bash
cd /var/www/arsipdigitalr2
git pull origin master
pm2 restart arsip-backend
pm2 logs arsip-backend --lines 50 | grep FileStatusSync
```

Variable environment baru (semua punya default, tidak wajib diisi):

```env
AUTO_RECONCILE_FILE_STATUS=true        # job rekonsiliasi tiap 6 jam
FILE_STATUS_SYNC_INTERVAL_MINUTES=360  # interval
DOWNLOAD_CACHE_TTL_MINUTES=60         # masa cache download
```

Tidak ada migrasi database. Hard refresh browser (Ctrl+Shift+R).

---

## 6. Checklist Test

- [ ] Upload 1 Invoice PDF → status naik 1, tombol Invoice muncul, download jalan
- [ ] Upload Bukti Bayar + Faktur Pajak (PPN) → status `3/3`, 3 tombol muncul
- [ ] Upload Invoice PDF + Bukti Bayar (NON) → status `2/2`, 2 tombol muncul
- [ ] **Hapus file dari Storage Handler** → refresh → status turun 1, tombol hilang
- [ ] **Hapus folder dari Storage Handler** → refresh → semua invoice di folder benar
- [ ] **Hapus file dari dashboard** → upload file lain → status **tidak** naik lagi
- [ ] Hapus file dari R2 di luar aplikasi → klik download → pesan "File tidak ditemukan",
      status turun setelah refresh
- [ ] Upload file non-PDF (PNG di-rename `.pdf`) → ditolak
- [ ] Upload 200 file sekaligus → semua status akurat (tidak ada `0/3` yang kelihatan)
- [ ] Dashboard admin zona → angka Lunas/Belum Lunas sama dengan dashboard utama
- [ ] Rekonsiliasi Tahap 1 → `countFixed` > 0 untuk data yang sebelumnya salah
- [ ] Rekonsiliasi Tahap 2 → `r2Missing` = jumlah file yang benar-benar hilang

---

## 7. Rollback

```bash
# Semua
git checkout HEAD~4 -- backend/invoice-file-status.js backend/file-status-reconciler.js \
  backend/file-status-sync-job.js backend/invoice-endpoints.js backend/storage-handler-endpoints.js \
  backend/query-optimizer.js backend/server.js backend/invoice-upload-helper.js \
  js/dashboard.js dashboard-admin-zona.html .env.example
pm2 restart arsip-backend
```

Rollback per fase: lihat `git log` (4 commit terpisah, masing-masing Fase 1–4).

Tidak ada perubahan skema. Data yang sudah dikoreksi oleh rekonsiliasi tidak perlu
dikembalikan (nilainya justru lebih benar).

---

## 8. Test Otomatis

```bash
cd backend && npx jest __tests__/invoice-file-status.test.js
```
→ 18 test (semua lulus): normalisasi keterangan, required count, dan 10 skenario
computeFileStatus (path saja, record saja, keduanya, penghapusan, tipe asing, parameter kosong).
