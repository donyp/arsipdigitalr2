# 🚛 Fleet Management System - Quick Start Guide

**Status: ✅ PRODUCTION READY**

Database tables sudah berhasil dibuat di Supabase. Sistem siap untuk digunakan!

---

## 🚀 Quick Setup (5 Minutes)

### Step 1: Pastikan Server Running
```bash
npm start
# or
node backend/server.js
```

### Step 2: Access Dashboard
Buka browser dan pergi ke:
```
http://localhost:5000/fleet
```

Atau klik menu **"Fleet Management"** di sidebar.

### Step 3: Mulai Menambah Kendaraan
1. Klik tombol **"Tambah Kendaraan"**
2. Isi data:
   - Nomor Plat: `B 1234 ABC`
   - Tipe: `T120SS BOX` (atau pilih tipe lain)
   - Nama: `Truck Anka 01`
3. Klik **"Simpan Kendaraan"**

✅ Selesai! Kendaraan sudah ditambahkan.

---

## 📋 Cara Menggunakan

### Menambah Dokumen Penting
1. Di vehicle card, klik tombol **"Dokumen"**
2. Pilih tipe dokumen:
   - **KIR** - Kendaraan Bermotor
   - **PAJAK_STNK** - Pajak & STNK
   - **PLAT** - License Plate
3. Isi tanggal penerbitan & expired
4. Klik **"Simpan Dokumen"**

**Status Otomatis:**
- 🟢 **Valid** - Masih berlaku > 30 hari
- 🟡 **Expiring** - Akan expired dalam 30 hari
- 🔴 **Expired** - Sudah expired

### Mencatat Service/Maintenance
1. Di vehicle card, klik tombol **"Service"**
2. Isi informasi:
   - Tipe: SERVICE / TIRE_REPLACEMENT / REPAIR / OTHER
   - Tanggal service
   - Deskripsi
   - Biaya (opsional)
   - Onderdil (opsional)
3. Klik **"Simpan Record"**

### Melihat Dokumen yang Mau Expired
1. Klik tab **"Akan Expired"**
2. Lihat semua dokumen expiring dalam 30 hari
3. Siap untuk perpanjangan

### Melihat Dokumen yang Sudah Expired
1. Klik tab **"Sudah Expired"**
2. Prioritaskan perpanjangan dokumen-dokumen ini

---

## 📊 Dashboard Tabs

| Tab | Fungsi | Warna |
|-----|--------|-------|
| **Semua Kendaraan** | Lihat semua vehicle cards dengan status dokumen | Normal |
| **Dokumen Penting** | Tabel semua dokumen dengan detail lengkap | Normal |
| **Akan Expired** | Dokumen expiring dalam 30 hari (perlu perhatian) | 🟡 Yellow |
| **Sudah Expired** | Dokumen yang sudah expired (urgent) | 🔴 Red |

---

## 🎯 Fitur-Fitur

### 1. Vehicle Management ✅
- Tambah/Edit/Hapus kendaraan
- Track: Plat, Tipe, Brand, Tahun, Warna, Engine #, dll
- Mark as active/inactive
- Notes untuk informasi tambahan

### 2. Document Tracking ✅
- Tracking KIR, PAJAK STNK, PLAT
- Auto-calculate days until expiration
- Status: PENDING / IN_PROGRESS / RENEWED / EXPIRED
- Alert system untuk documents expiring

### 3. Maintenance History ✅
- Log service, tire replacement, repairs
- Track biaya maintenance
- Record odometer reading
- Track parts replaced
- Plan next service date

### 4. Smart Alerts ✅
- Dashboard stats (Total, Expired, Expiring)
- Color-coded badges (green/yellow/red)
- Alert banners di tab expiring & expired
- Automatic status calculation

### 5. Modern UI ✅
- Responsive design (mobile, tablet, desktop)
- Dark mode support
- Loading states & notifications
- Form validation
- Easy to use interface

---

## 📱 Screen Layout

```
┌─────────────────────────────────────────┐
│ Fleet Management                        │
│ [Tambah Kendaraan] [Refresh]           │
├─────────────────────────────────────────┤
│ [Stats Cards - 3 cards]                 │
│ Total: 5 | Expired: 2 | Expiring: 3   │
├─────────────────────────────────────────┤
│ [Tabs]                                  │
│ Semua | Dokumen | Akan Expired | Sudah │
├─────────────────────────────────────────┤
│                                         │
│ [Vehicle Cards - Grid View]             │
│                                         │
│ ┌─────────────────────────────────┐   │
│ │ 🚛 T120SS BOX                   │   │
│ │ B 1111 ABC                      │   │
│ │ Truck Anka 01                   │   │
│ │ [KIR ✓] [PAJAK ⚠️] [PLAT ✗]    │   │
│ │ [+ Dokumen] [+ Service]        │   │
│ └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

---

## 🔧 Troubleshooting

### Problem: Menu "Fleet Management" tidak muncul
**Solution:**
1. Clear browser cache (Ctrl+Shift+Delete)
2. Hard refresh (Ctrl+Shift+R)
3. Restart browser

### Problem: "Failed to load vehicles" error
**Solution:**
1. Check browser console (F12)
2. Verify JWT token is valid
3. Login again

### Problem: Notifications tidak showing
**Solution:**
1. Check if notification-system.js loaded
2. Open console dan ketik: `Notify.success('Test')`
3. Jika tidak work, restart browser

### Problem: "Database connection failed"
**Solution:**
1. Check backend server running: `npm start`
2. Verify Supabase credentials di .env
3. Check internet connection

---

## 📚 API Endpoints Reference

```bash
# Vehicles
GET  /api/fleet/vehicles              # List all vehicles
GET  /api/fleet/vehicles/:id          # Get vehicle detail
POST /api/fleet/vehicles              # Create vehicle
PUT  /api/fleet/vehicles/:id          # Update vehicle

# Documents
POST /api/fleet/documents             # Create document
PUT  /api/fleet/documents/:id         # Update document
DELETE /api/fleet/documents/:id       # Delete document
GET  /api/fleet/documents/expiring    # Get expiring docs
GET  /api/fleet/documents/expired     # Get expired docs

# Maintenance
GET  /api/fleet/maintenance/:vehicleId  # Get maintenance history
POST /api/fleet/maintenance             # Create maintenance record
PUT  /api/fleet/maintenance/:id         # Update maintenance
DELETE /api/fleet/maintenance/:id       # Delete maintenance
```

---

## ✅ Testing

Run integration tests:
```bash
node backend/test-fleet-management.js
```

Tests will verify:
- ✅ Vehicle CRUD operations
- ✅ Document CRUD operations
- ✅ Maintenance CRUD operations
- ✅ Expiring documents endpoint
- ✅ Expired documents endpoint
- ✅ All status calculations

---

## 🗂️ Project Files

### Database
- `backend/CREATE_FLEET_MANAGEMENT_TABLES.sql` - Database schema

### Backend
- `backend/fleet-management-endpoints.js` - API endpoints
- `backend/execute-fleet-management-migration.js` - Migration script
- `backend/test-fleet-management.js` - Integration tests

### Frontend
- `fleet-dashboard.html` - Dashboard UI

### Documentation
- `FLEET_MANAGEMENT_QUICKSTART.md` - This file
- `FLEET_MANAGEMENT_SETUP_GUIDE.md` - Detailed setup & testing
- `FLEET_MANAGEMENT_FEATURES.md` - Feature overview

### Modified Files
- `backend/server.js` - Added fleet routes
- `js/sidebar.js` - Added menu item

---

## 📋 Sample Test Data

Anda bisa menambah kendaraan test dengan data ini:

```json
[
  {
    "plate_number": "B 1111 ABC",
    "vehicle_type": "T120SS BOX",
    "vehicle_name": "Truck T120 01",
    "brand_model": "Isuzu T120SS",
    "year_manufacture": 2023
  },
  {
    "plate_number": "B 2222 ABC",
    "vehicle_type": "TRAGA BOX",
    "vehicle_name": "Truck TRAGA 01",
    "brand_model": "Isuzu TRAGA",
    "year_manufacture": 2022
  },
  {
    "plate_number": "B 3333 ABC",
    "vehicle_type": "ENGKEL BOX",
    "vehicle_name": "Truck ENGKEL 01",
    "brand_model": "Isuzu ENGKEL",
    "year_manufacture": 2021
  },
  {
    "plate_number": "B 4444 ABC",
    "vehicle_type": "DOUBLE BOX",
    "vehicle_name": "Truck DOUBLE 01",
    "brand_model": "Isuzu DOUBLE",
    "year_manufacture": 2020
  },
  {
    "plate_number": "B 5555 ABC",
    "vehicle_type": "DOUBLE BOX",
    "vehicle_name": "Truck DOUBLE 02",
    "brand_model": "Isuzu DOUBLE",
    "year_manufacture": 2019
  }
]
```

---

## 🎓 Typical Workflow

### Scenario 1: Truck Baru Datang
1. Klik "Tambah Kendaraan"
2. Isi: Plat, Tipe, Nama, Brand, Tahun
3. Klik "Simpan"

### Scenario 2: KIR Mau Expired
1. Check tab "Akan Expired"
2. Lihat KIR Truck B 1111 expiring dalam 10 hari
3. Rencanakan perpanjangan
4. Setelah diperpanjang, edit dokumen dengan tanggal baru

### Scenario 3: Service Rutin
1. Buka Truck B 1111
2. Klik tombol "Service"
3. Isi: Tipe (SERVICE), Tanggal, Deskripsi
4. Tambah biaya, provider, parts
5. Set next service date
6. Klik "Simpan Record"

### Scenario 4: Tire Replacement
1. Truck kena ban sobek
2. Buka kendaraan, klik "Service"
3. Pilih tipe: "TIRE_REPLACEMENT"
4. Isi: Tanggal, Deskripsi, Ban yang diganti
5. Record untuk tracking history

---

## 🎉 You're All Set!

Fleet Management system sudah siap digunakan. Selamat mencoba! 🚀

Untuk pertanyaan atau support:
- Baca `FLEET_MANAGEMENT_SETUP_GUIDE.md` untuk detail lengkap
- Baca `FLEET_MANAGEMENT_FEATURES.md` untuk fitur overview
- Check `/api/fleet/` endpoints documentation

---

**Status: 🟢 PRODUCTION READY**

Happy Fleet Managing! 🚛✨
