# Perbaikan Performa: Filter Bulan pada Daftar File Invoice

**Tanggal:** 20 Oktober 2026
**Status:** Sudah diimplementasikan (siap deploy)
**File yang berubah:** `js/dashboard.js`, `backend/invoice-endpoints.js`, `backend/server.js`
**File baru:** `backend/ADD_PERFORMANCE_INDEXES.sql`

---

## 1. Masalah

Saat memilih filter **Bulan → Terapkan** pada daftar invoice di dashboard, tabel sangat lama
muncul (tertahan di tulisan *"Memeriksa ketersediaan file..."*).

---

## 2. Akar Masalah

### 2.1 N+1 request ke endpoint `check-file` (penyebab utama)

`js/dashboard.js` → `renderInvoiceTable()` memanggil `/api/invoice/check-file/...`
**2–3 kali untuk setiap baris**:

| Jenis file | Request per baris |
|---|---|
| Invoice PDF | 1 |
| Bukti Bayar | 1 |
| Faktur Pajak | 1 (hanya PPN) |

Dengan `INVOICE_PAGE_SIZE = 20` → **40–60 request HTTP per halaman**.

Setiap request `check-file` di `backend/invoice-endpoints.js` melakukan:

1. query `invoice_file_list`
2. query `invoice_files`
3. `HeadObject` ke Cloudflare R2
4. `updateFilesUploadedCount()` → 2 query DB + 1 `UPDATE` + (bila path kosong)
   scan R2 sampai ~15 `HeadObject`

Total per halaman: **±300 round-trip database + 60+ request R2**.

### 2.2 Background scan R2 berjalan setiap filter

`applyInvoiceFilters()` → `triggerBatchR2Scan()` → `POST /api/invoice/scan-filtered`
memindai R2 untuk **seluruh invoice** yang cocok filter bulan, satu per satu, dan berjalan
bersamaan dengan render tabel.

### 2.3 Dropdown filter menarik seluruh data

`loadFilterOptions()` memakai `/api/invoice/list?limit=10000` → menarik
**8.000+ baris invoice lengkap (semua kolom)** hanya untuk mengisi dropdown
Tahun / Toko / Kategori. Setiap dashboard dibuka,Ini terulang.

### 2.4 Filter tanggal `/api/files` tidak pernah diterapkan

`js/dashboard.js` mengirim `start_date` & `end_date`, tetapi `backend/server.js`
tidak pernah membacanya → filter tanggal tidak bekerja di server.

### 2.5 Index database belum ada untuk kolom yang difilter

Belum ada index untuk `invoice_file_list (zona_id, tanggal)` maupun
`files (zona_id, created_at)` → `COUNT exact` + filter tanggal selalu scan penuh.

---

## 3. Perubahan yang Dilakukan

### 3.1 `js/dashboard.js` — hapus N+1 request

`renderInvoiceTable()` tidak lagi memanggil `check-file` per baris.
Status file diambil dari kolom path yang **sudah ikut** di response
`/api/invoice/list` (`select *`):

- `invoice_pdf_path` / `uploaded_file_path` → tombol Download Invoice
- `bukti_bayar_path` → tombol Download Bukti Bayar
- `faktur_pajak_path` → tombol Download Faktur Pajak

Angka status `x/y` **tidak berubah** (tetap memakai `files_uploaded_count`).

> Cara ini sudah dipakai oleh `showInvoiceActionMenu()` (action menu) di file yang sama
> dengan komentar *"Build menu HTML using cached file status (NO API CALLS - instant render)"*.

### 3.2 `backend/invoice-endpoints.js` — `check-file` tanpa scan R2 + write

`updateFilesUploadedCount()` (scan R2 + `UPDATE`) diganti hitungan dari database:

- `COUNT` tabel `invoice_files` (1 query)
- nilai `files_uploaded_count` yang sudah di-maintain upload flow + trigger DB

Perilaku `exists` (cek file di R2) **tidak berubah**.

### 3.3 `backend/invoice-endpoints.js` — batasi background scan

`POST /api/invoice/scan-filtered`:

- default hanya memindai invoice dengan `files_uploaded_count = 0` (file hilang /
  diunggah langsung ke R2 di luar aplikasi)
- maksimum **50 invoice** per request
- jeda 50 ms antar invoice

Scan penuh masih bisa dipicu dengan body `{"force": true}`.

### 3.4 `backend/invoice-endpoints.js` — endpoint baru `/api/invoice/filter-options`

Endpoint ringan untuk mengisi dropdown filter: hanya mengambil 4 kolom
(`toko, konsumen, keterangan, tanggal`), tanpa `COUNT` pada data utama,
distinct dihitung di server.

### 3.5 `js/dashboard.js` — cache opsi filter

- Opsi dropdown di-cache di `localStorage` **30 menit** (key per role + zona).
- Otomatis fallback ke cara lama (`limit=10000`) bila endpoint baru tidak tersedia.

### 3.6 `backend/server.js` — filter tanggal `/api/files`

`start_date` / `end_date` sekarang diterapkan ke `created_at` (tanggal upload),
dengan validasi format `YYYY-MM-DD`. Rentang bersifat inklusif sampai `23:59:59.999`.

### 3.7 `backend/ADD_PERFORMANCE_INDEXES.sql` — index baru

Index untuk query yang paling sering dipakai (filter zona + tanggal, count, dan
background scan). Tidak mengubah data/kolom/constraint.

---

## 4. Dampak yang Diharapkan

| Item | Sebelum | Sesudah |
|---|---|---|
| Request `check-file` per halaman | 40–60 | **0** |
| Round-trip DB per halaman | ±300 | ±2–5 |
| Request R2 per halaman | 60+ | 0–1 |
| Payload inisialisasi dropdown | 8.000+ baris penuh | 4 kolom + cache 30 menit |
| Background scan per filter | seluruh invoice bulan | ≤50 invoice (hanya count = 0) |

---

## 5. Cara Deploy

```bash
# 1. Pull & restart
cd /var/www/arsipdigitalr2
git pull origin master
pm2 restart arsip-backend

# 2. Jalankan SQL index (Supabase Dashboard > SQL Editor > New query)
#    paste: backend/ADD_PERFORMANCE_INDEXES.sql > Run
#    (jalankan saat jam sepi)

# 3. Hard refresh browser (Ctrl+Shift+R) agar js/dashboard.js ter-update
```

Verifikasi cepat:

```bash
curl -s http://localhost:5000/api/health
pm2 logs arsip-backend --lines 30 | grep -i "filter-options"
```

---

## 6. Checklist Testing

- [ ] Buka dashboard → dropdown Tahun/Toko/Kategori terisi normal
- [ ] Pilih Bulan (mis. bulan lalu) → klik **Terapkan**
- [ ] DevTools → Network: request `/api/invoice/check-file` **harus 0**
- [ ] Tabel muncul tanpa spinner "Memeriksa ketersediaan file..."
- [ ] Status kolom tetap `2/2`, `1/2`, `0/2` seperti sebelumnya
- [ ] Tombol download Invoice/Bukti/Faktur muncul untuk baris yang punya file
- [ ] Klik tombol download → file terunduh
- [ ] Pagination halaman 2 tetap jalan
- [ ] Upload bukti bayar / faktur pajak → deteksi file duplikat masih bekerja
- [ ] Filter Status (Lunas / Belum Lunas) tetap jalan
- [ ] Halaman upload → tidak ada perubahan perilaku

---

## 7. Rollback

```bash
git checkout HEAD~1 -- js/dashboard.js backend/invoice-endpoints.js backend/server.js
pm2 restart arsip-backend
```

Index database boleh dibiarkan (tidak merusak apa pun) atau dihapus manual:

```sql
DROP INDEX IF EXISTS idx_invoice_file_list_zona_tanggal;
DROP INDEX IF EXISTS idx_invoice_file_list_tanggal;
DROP INDEX IF EXISTS idx_invoice_file_list_keterangan;
DROP INDEX IF EXISTS idx_invoice_file_list_files_missing;
DROP INDEX IF EXISTS idx_files_active_created;
DROP INDEX IF EXISTS idx_files_zona_active_created;
DROP INDEX IF EXISTS idx_files_active_category;
```

---

## 8. Catatan Perilaku

Satu perbedaan kecil yang disengaja: **tombol download** kini ditentukan dari path di
database, bukan dari hasil scan R2 realtime. Kalau sebuah file dihapus manual dari R2
(tanpa menghapus record di database), tombol download masih muncul dan download akan
menampilkan error. Halaman **Upload Bukti Bayar / Faktur Pajak** tetap memakai pengecekan
R2 realtime (`check-file`), sehingga deteksi duplikat/upload ulang file yang hilang
tetap bekerja seperti sebelumnya.
