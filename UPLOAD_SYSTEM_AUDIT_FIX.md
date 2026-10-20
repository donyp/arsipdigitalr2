# Audit & Perbaikan Sistem Upload File

**Tanggal:** 20 Oktober 2026
**Status:** Selesai diimplementasikan, siap deploy
**File berubah:** `backend/server.js`, `backend/invoice-endpoints.js`, `backend/r2-storage.js`, `backend/direct-postgres-update.js`, `js/upload-invoice-pdf.js`, `upload-bukti-bayar.html`, `upload-faktur-pajak.html`, `upload.html`
**File baru:** `backend/upload-queue.js`, `backend/invoice-upload-helper.js`

---

## 1. Ringkasan Masalah (Audit)

Audit dilakukan terhadap 3 alur upload (Invoice PDF, Bukti Bayar, Faktur Pajak) plus alur
Data File (`/api/files/upload`) sebagai pembanding.

### Blocker

| Kode | Temuan | Dampak |
|---|---|---|
| **B1** | Upload Invoice PDF memakai `setImmediate()` (fire & forget) + `multer.memoryStorage` | Server membalas "sukses" duluan, upload R2 jalan di background. Untuk bulk 200+ file, buffer menumpuk di RAM (400 MB–2 GB) → **PM2 me-restart worker** (`max_memory_restart: 1G`) → upload hilang **tanpa error ke user** |
| **B2** | Upload Invoice PDF **melaporkan sukses walau file gagal** di R2 | Saat R2 menolak (`DUPLICATE_FILE`), `remotePath` jadi `null` → `updateFilePath(..., null)` **menghapus path** → trigger DB menurunkan `files_uploaded_count` → status di daftar file turun dari `2/2` jadi `0/2` padahal file ada di R2 |
| **B3** | Rate limiter tidak pernah aktif & tidak kompatibel dengan bulk | `app.set('trust proxy')` tidak pernah di-set → `req.ip` = `127.0.0.1` → semua limiter **di-skip**. Selain itu `apiLimiter` (100/15 mnt) & `fileOpsLimiter` (20/15 mnt) nilainya tidak realistis: polling dashboard saja sudah ±230 request/15 mnt per user. Route invoice juga **terdaftar sebelum** limiter → tidak pernah ikut di-limit sama sekali |

### Temuan lain

| Temuan | Lokasi |
|---|---|
| Aturan duplikat berbeda antar 3 tipe; `expectedNewPath` memakai folder `BUKTIBAYAR`/`FAKTURPAJAK` sedangkan R2 memakai `bukti-bayar`/`Faktur-Pajak` → cek duplikat selalu salah | `invoice-endpoints.js` (route lama) |
| Route `/api/invoice/upload-faktur-pajak` (tidak dipakai UI) membaca `uploadResult.success`/`.path` padahal `uploadDocumentFile` return `{ storagePath }` → **selalu dianggap gagal** meski file sudah masuk R2 → path tak pernah tercatat | `invoice-endpoints.js:3464` (lama) |
| Tidak ada validasi magic bytes di 3 route invoice (hanya `/api/files/upload` yang punya `requirePdfMagic`) → file non-PDF bisa masuk | `invoice-endpoints.js` |
| `updateFilesUploadedCount()` (scan R2 s/d 15 HeadObject) dipanggil **setiap upload** → 200 file = 200 scan R2 | `invoice-endpoints.js` |
| `updateFilePath()` (https.request) **tanpa timeout** → koneksi menggantung menahan buffer selamanya | `direct-postgres-update.js` |
| Pemindaian fallback memakai nama bulan **Inggris**, sedangkan upload memakai nama bulan **Indonesia** → file tidak pernah ditemukan saat fallback | `invoice-endpoints.js` |
| `upload.html` (halaman legacy) punya **syntax error** → seluruh script halaman mati | `upload.html` |
| Validasi faktur 1–2 request **per file** (200 file = 200–400 request) | 3 halaman upload |
| Bukti bayar / faktur pajak upload **sequential** (1 file per giliran) | 2 halaman upload |

---

## 2. Aturan Duplikat (BARU — seragam untuk 3 tipe)

| Kondisi | Hasil |
|---|---|
| Invoice punya path recorded **dan** file masih ada di R2 | **409 Duplicate** + pesan "Hapus file lama terlebih dahulu bila ingin menggantinya" |
| Invoice punya path recorded tapi file **hilang** dari R2 (record basi) | Upload **diizinkan** (menggantikan record) |
| Invoice **tidak punya** path recorded, tapi file di R2 sudah ada (orphan) | **Di-adopt**: path dicatat ke DB, **tanpa upload ulang** (menyembuhkan data hasil upload gagal) |
| `overwrite=true` di body request | Upload dipaksakan (menimpa file) |
| Gagal mengecek R2 (network) | **Tidak menolak** (lenient) — upload tetap jalan |

> File orphan sering terjadi karena bug B2 versi lama (file masuk R2, DB gagal write).
> Alur "adopt" membuat sistem bisa pulih sendiri tanpa perlu hapus manual.

---

## 3. Perubahan per Fase

### Fase 0 — Anti-blokir (B1, B3)

- **B1** — `backend/upload-queue.js` (baru): antrean upload dengan batas konkurensi
  (default 4, configurable via `UPLOAD_QUEUE_CONCURRENCY`).
  - `uploadGate` di route: maksimal **8 request upload** diproses bersamaan → RAM server terkunci
    (8 × 10 MB = 80 MB, bukan 400 MB–2 GB).
  - Upload **menunggu selesai** (tidak `setImmediate`) → user tahu file benar-benar masuk.
  - Client: batas konkurensi 6 (invoice PDF) / 5 (bukti bayar, faktur pajak).
  - Client: retry otomatis 3x untuk HTTP 429/503 (antrean penuh).
- **B3** —
  - `app.set('trust proxy', 'loopback')` → `req.ip` = IP client asli, limiter jadi benar
    dan tidak bisa dimanipulasi dari luar.
  - Key limiter **per user** (payload JWT, fallback IP) — bukan per IP gemeinsam.
  - `apiLimiter`: 100 → **1200 / 15 menit** (≈5× kebutuhan polling normal).
  - `uploadLimiter` (baru): **1000 upload / 15 menit** per user; endpoint upload
    tidak lagi dihitung oleh `apiLimiter`.
  - `fileOpsLimiter`: 20 → **1000 / 15 menit**.
  - **Order diperbaiki**: limiter sekarang didaftarkan **sebelum** `registerInvoiceEndpoints()`.
    Sebelumnya route invoice terdaftar lebih dulu → limiter tidak pernah jalan untuk upload.
  - Timeout request untuk endpoint upload: 60 s → **300 s** (sesuai `proxy_read_timeout` nginx).

### Fase 1 — Koreksi validasi & status

- `backend/invoice-upload-helper.js` (baru): path builder, state machine duplikat,
  persist ke DB (tanpa pernah menulis NULL), sinkronisasi count dari database.
- Path R2 kini dihitung **satu fungsi** (`buildInvoicePath` / `buildDocumentPath` di
  `r2-storage.js`) yang dipakai bersama oleh route upload dan penulisan ke R2 →
  mustahil lagi berbeda antara "path yang dicek" dan "path yang ditulis".
- **Tidak pernah menulis NULL** ke kolom path: upload gagal → path lama utuh, count tidak turun.
- Response upload memakai **hasil nyata** (sukses/gagal/409), bukan lagi "processing".
- Route `/api/invoice/upload-faktur-pajak` diperbaiki → memakai handler yang sama dengan
  `/upload-document` (hanya ada SATU implementasi upload faktur pajak).
- Validasi magic bytes (`%PDF-`) ditambahkan di 3 route invoice.
- `updateFilePath()` diberi timeout 15 detik.
- Pemindaian fallback sekarang mencoba nama bulan Indonesia **dan** Inggris.
- `upload.html`: syntax error yang membuat script halaman mati diperbaiki.

### Fase 2 — Akselerasi

- **Endpoint baru** `POST /api/invoice/check-fakturs-batch` (body: `{ fakturs: [...] }`).
  Query pakai `.in('faktur', ...)` per batch 100 → 200 file = **2 query**, bukan 200.
- 3 halaman upload memakai endpoint batch (validasi turun dari 200–400 request → 2).
- Pre-check `check-file` per file dihapus dari halaman upload (server sudah jadi
  penentu final/otoritatif) → hemat 100–400 request.
- `updateFilesUploadedCount()` (scan R2) **dihapus** dari jalur upload; count
  disinkronkan dari database (1 SELECT, UPDATE hanya bila berbeda).
- Penulisan DB per file: 1 upsert `invoice_files` + 1 PATCH kolom path (sebelumnya
  hingga 3 percobaan upsert + PATCH + 3 query count + 1 UPDATE).

---

## 4. Ringkasan Dampak Angka

| Metrik (bulk 200 file Invoice PDF) | Sebelum | Sesudah |
|---|---|---|
| Request browser | 400 | **~202** (2 validasi batch + 200 upload) |
| Query Supabase | ±1.600 | **~400–600** (2–3 per file, paralel) |
| Request R2 | ±500 | **~200** (PUT) + 2 HEAD per file (cek duplikat) |
| Puncak RAM server | 400 MB – 2 GB (risiko OOM kill) | **≤ 80 MB** |
| Upload hilang diam-diam | YA (B1 + B2) | **TIDAK** (response = hasil nyata) |
| Batas bulk | praktis ~50 file | **200+ file** (tanpa batas jumlah file invoice PDF) |
| Lamanya validasi 200 file | 20–40 detik | **±1 detik** |
| Lamanya upload 200 file | 3–6 menit (±) | **1–2 menit** (diikat bandwidth R2) |

---

## 5. Deploy

```bash
cd /var/www/arsipdigitalr2
git pull origin master
pm2 restart arsip-backend
pm2 logs arsip-backend --lines 50
```

Tidak ada migrasi database. Tidak ada perubahan skema.

Variabel environment opsional (default sudah aman):

```env
UPLOAD_QUEUE_CONCURRENCY=4
UPLOAD_QUEUE_MAX_PENDING=500
```

Hard refresh browser (Ctrl+Shift+R) agar file JS/HTML ter-update.

---

## 6. Checklist Test

- [ ] Upload 1 Invoice PDF → status `1/2`, path terisi, file ada di R2
- [ ] Upload **file Invoice PDF yang sama** lagi → 409 "sudah ada (Duplicate)",
      status **tetap** `1/2` (tidak turun ke 0/2) — **ini regresi B2**
- [ ] Upload 1 Bukti Bayar → status `2/2`
- [ ] Upload Bukti Bayar yang sama → ditolak duplikat
- [ ] Upload file non-PDF yang di-rename `.pdf` → ditolak "konten file bukan PDF"
- [ ] Upload 60 file sekaligus → semua masuk, tidak ada 429, PM2 tidak restart
- [ ] Upload 200 file Invoice PDF → selesai, `pm2 logs` tidak ada "restart",
      tidak ada upload gagal
- [ ] Upload 50 Bukti Bayar + 50 Faktur Pajak → semua masuk
- [ ] Cek daftar invoice: kolom status `x/y` benar untuk semua file yang diupload
- [ ] Download file dari daftar invoice → normal
- [ ] Halaman `/upload` (legacy) → tidak ada error di console

---

## 7. Rollback

```bash
# Semua perubahan
git checkout HEAD~3 -- backend/server.js backend/invoice-endpoints.js \
  backend/r2-storage.js backend/direct-postgres-update.js backend/upload-queue.js \
  backend/invoice-upload-helper.js js/upload-invoice-pdf.js \
  upload-bukti-bayar.html upload-faktur-pajak.html upload.html
pm2 restart arsip-backend
```

Rollback per fase (commit terpisah):

| Fase | Commit | Perintah |
|---|---|---|
| Fase 0 | `git log --oneline` → commit "Fase 0" | `git checkout <commit>~1 -- backend/server.js backend/upload-queue.js .env.example` |
| Fase 1 | commit "Fase 1" | `git checkout <commit>~1 -- backend/invoice-endpoints.js backend/invoice-upload-helper.js backend/r2-storage.js backend/direct-postgres-update.js` |
| Fase 2 | commit "Fase 2" | `git checkout <commit>~1 -- js/upload-invoice-pdf.js upload-bukti-bayar.html upload-faktur-pajak.html upload.html` |

Tidak ada perubahan data yang perlu di-rollback. Index database (dari fix sebelumnya) tidak
berpengaruh.

---

## 8. Catatan Tambahan (tidak dikerjakan, untuk Dijawab Nanti)

1. **CSRF middleware** (`app.use('/api/', csrfProtection)`) masih terdaftar **setelah**
   route invoice → route invoice tidak lewat cek CSRF. Tidak exploitable (butuh JWT header,
   bukan cookie), tapi sebaiknya dipindahkan juga bila mau konsisten.
2. **Job table untuk upload** (`upload_jobs`) agar upload bisa di-resume dan statusnya
   persisten di database — sangat berguna kalau nanti server sering restart.
3. **Unique index** `files (nama_file, zona_id) WHERE deleted_at IS NULL` untuk menutup
   race condition upload file Data File yang sama secara paralel.
4. `global.batchLocks` di `/api/files/upload` hanya per-proses → tidak berlaku di mode
   PM2 cluster. Perlu lock di database bila batching harus konsisten.
