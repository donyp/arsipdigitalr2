# Panduan Fitur Daftar Dokumen Armada

## Deskripsi
Fitur **Daftar Dokumen Armada** memungkinkan Anda untuk melihat dan mengelola semua dokumen penting dari setiap kendaraan dalam armada. Anda dapat melacak status dokumen (masih berlaku, segera kadaluarsa, atau sudah kadaluarsa) dengan mudah melalui antarmuka yang intuitif.

## Akses Fitur
1. Login ke aplikasi Pusat Arsip Anka
2. Klik menu **Fleet Management** di sidebar
3. Pilih **Daftar Dokumen** dari submenu

Atau akses langsung: `http://localhost:5000/fleet-documents-list`

## Fitur-Fitur Utama

### 1. Ringkasan Statistik (Dashboard Cards)
Tampilan cepat beberapa metrik penting:
- **Total Kendaraan**: Jumlah total kendaraan dalam armada
- **Total Dokumen**: Jumlah total dokumen dari semua kendaraan
- **Dokumen Kadaluarsa**: Jumlah dokumen yang sudah kadaluarsa
- **Akan Segera Expired**: Dokumen yang akan kadaluarsa dalam 30 hari ke depan

### 2. Filter Dokumen
Anda dapat memfilter dokumen berdasarkan:

#### Filter Kendaraan
- Lihat dokumen dari kendaraan spesifik atau semua kendaraan
- Dropdown menampilkan nomor plat dan nama kendaraan
- Contoh: "B 1111 AAA - T120SS BOX"

#### Filter Status Dokumen
- **Semua Status**: Tampilkan semua dokumen
- **Masih Berlaku**: Dokumen yang masih valid
- **Segera Kadaluarsa (≤30 hari)**: Dokumen yang akan kadaluarsa dalam 30 hari
- **Kadaluarsa**: Dokumen yang sudah melampaui tanggal kadaluarsa

#### Filter Jenis Dokumen
- **Semua Jenis Dokumen**: Tampilkan semua tipe
- **KIR (Kendaraan Rias)**: Dokumen pemeriksaan kendaraan
- **PAJAK STNK**: Dokumen pajak dan STNK
- **PLAT Nomor**: Dokumen plat nomor kendaraan

### 3. Tombol Aksi
- **🔍 Filter**: Terapkan filter yang telah dipilih
- **↻ Reset**: Kembalikan filter ke keadaan awal (tampilkan semua)

### 4. Tampilan Kartu Kendaraan
Setiap kendaraan ditampilkan dalam kartu yang berisi:

#### Header Kendaraan (Berwarna Gradien Ungu)
- Nama kendaraan
- Nomor plat (dalam format besar dan monospace untuk pengenalan cepat)

#### Informasi Kendaraan
- Tipe kendaraan (T120SS BOX, TRAGA BOX, ENGKEL BOX, DOUBLE BOX)
- Merek dan model
- Tahun pembuatan
- Warna kendaraan

#### Daftar Dokumen
Setiap kartu menampilkan dokumen-dokumen kendaraan tersebut:

**Format Setiap Dokumen:**
```
[Ikon] Jenis Dokumen
📅 Berlaku: [Tanggal Mulai] - [Tanggal Kadaluarsa]
[Status Badge]
```

**Jenis Dokumen:**
- 🔍 KIR
- 💰 PAJAK STNK
- 🏷️ PLAT

**Status Badge (Warna berbeda):**
- ✅ **Masih Berlaku** (Badge hijau) - Dokumen masih valid
- ⚠️ **Akan Expired** (Badge kuning) - Dokumen akan kadaluarsa dalam X hari
- ❌ **Kadaluarsa** (Badge merah) - Dokumen sudah melampaui tanggal kadaluarsa

### 5. Kondisi Khusus
- **Belum Ada Dokumen**: Jika kendaraan belum memiliki dokumen, ditampilkan pesan "Belum ada dokumen tercatat"
- **Tidak Ada Kendaraan**: Jika belum ada kendaraan dalam sistem, tampilkan pesan untuk menambahkan kendaraan

## Contoh Penggunaan

### Skenario 1: Cek Dokumen KIR Semua Kendaraan
1. Buka halaman Daftar Dokumen
2. Di "Filter Jenis Dokumen", pilih "KIR (Kendaraan Rias)"
3. Klik tombol "Filter"
4. Lihat semua dokumen KIR dari setiap kendaraan

### Skenario 2: Cek Dokumen Pajak yang Segera Kadaluarsa
1. Buka halaman Daftar Dokumen
2. Di "Filter Jenis Dokumen", pilih "PAJAK STNK"
3. Di "Filter Status Dokumen", pilih "Segera Kadaluarsa (≤30 hari)"
4. Klik "Filter"
5. Prioritaskan perpanjangan dokumen-dokumen tersebut

### Skenario 3: Lihat Semua Dokumen Satu Kendaraan
1. Buka halaman Daftar Dokumen
2. Di "Filter Kendaraan", pilih kendaraan spesifik (contoh: "B 1111 AAA - T120SS BOX")
3. Klik "Filter"
4. Lihat semua dokumen kendaraan tersebut dengan statusnya

### Skenario 4: Audit Dokumen Kadaluarsa
1. Di "Filter Status Dokumen", pilih "Kadaluarsa"
2. Klik "Filter"
3. Lihat semua dokumen yang sudah kadaluarsa
4. Segera ambil tindakan untuk memperpanjangnya

## Data yang Ditampilkan

### Per Kendaraan
- ID kendaraan (UUID)
- Nomor plat
- Nama kendaraan
- Tipe kendaraan
- Merek dan model
- Tahun pembuatan
- Warna

### Per Dokumen
- Jenis dokumen (KIR, PAJAK STNK, PLAT)
- Tanggal penerbitan
- Tanggal kadaluarsa
- Nomor dokumen
- Penerbitan oleh
- Status perpanjangan (PENDING, IN_PROGRESS, RENEWED, EXPIRED)
- Catatan
- Hari hingga kadaluarsa (dihitung otomatis)
- Status kadaluarsa (sudah/belum)

## Responsif Design
Halaman ini sepenuhnya responsif dan dapat diakses dari:
- Desktop (2 kolom ke atas)
- Tablet (1-2 kolom)
- Mobile (1 kolom)

## Keamanan
- Memerlukan JWT token untuk akses
- Hanya pengguna yang sudah login yang dapat mengakses
- Role-based access: Admin dan Moderator dapat mengakses

## Tips & Trik

### 1. Pantau Dokumen Segera Kadaluarsa
Gunakan filter "Segera Kadaluarsa" untuk mengidentifikasi dokumen yang perlu diperbarui dalam 30 hari ke depan.

### 2. Audit Rutin
Lakukan audit mingguan untuk memastikan tidak ada dokumen yang terlewat untuk diperbarui.

### 3. Rencanakan Perpanjangan
Identifikasi dokumen yang akan segera kadaluarsa dan rencanakan perpanjangan sebelum terlambat.

### 4. Manajemen Per Kendaraan
Filter berdasarkan kendaraan spesifik untuk melihat semua dokumen kendaraan tersebut sekaligus.

## API Endpoints yang Digunakan

### 1. Mendapatkan Daftar Kendaraan
```
GET /api/fleet/vehicles
Headers: Authorization: Bearer {token}
```

### 2. Mendapatkan Detail Kendaraan & Dokumennya
```
GET /api/fleet/vehicles/{id}
Headers: Authorization: Bearer {token}
```

Response mencakup:
- Detail kendaraan
- Daftar dokumen dengan status
- Statistik dokumen

## Troubleshooting

### Halaman Kosong/Tidak Ada Data
- Pastikan sudah login dengan akun yang tepat
- Pastikan sudah menambahkan kendaraan di dashboard Fleet Management
- Periksa browser console untuk error messages

### Filter Tidak Bekerja
- Pastikan memilih opsi sebelum klik tombol "Filter"
- Coba klik tombol "Reset" terlebih dahulu
- Refresh halaman jika diperlukan

### Tanggal Tidak Muncul
- Pastikan data dokumen sudah dimasukkan dengan benar di database
- Periksa format tanggal (harus format ISO: YYYY-MM-DD)

## Integrasi dengan Sistem

Halaman ini terintegrasi dengan:
- **Fleet Management Dashboard** (/fleet) - Dashboard utama armada
- **API Fleet Endpoints** (/api/fleet/*) - Backend untuk data
- **Sidebar Navigation** - Menu utama aplikasi
- **Supabase Database** - Penyimpanan data kendaraan dan dokumen

## Update & Maintenance

### Kapan Dokumen di-Update?
- Melalui Fleet Management Dashboard: Tambah/Edit dokumen
- Melalui API endpoints: POST/PUT /api/fleet/documents

### Kapan Kendaraan di-Update?
- Melalui Fleet Management Dashboard: Tambah/Edit kendaraan
- Melalui API endpoints: POST/PUT /api/fleet/vehicles

## Performance

Halaman ini dioptimasi untuk:
- **Loading Time**: Data dimuat secara paralel (tidak blocking)
- **Rendering**: Grid responsif dengan CSS yang efisien
- **Filtering**: Filter dilakukan di client-side untuk response cepat
- **Caching**: Token disimpan di localStorage untuk login persistensi

---

**Versi**: 1.0  
**Tanggal Update**: October 2026  
**Status**: Production Ready ✅
