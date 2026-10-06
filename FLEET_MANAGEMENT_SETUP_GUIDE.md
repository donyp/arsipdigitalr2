# Fleet Management System - Setup & Testing Guide

## Overview
Fleet Management system untuk mengelola armada kendaraan dengan tracking surat-surat penting dan history service.

### Features:
- ✅ Manajemen Kendaraan (5 armada: T120SS BOX, TRAGA BOX, ENGKEL BOX, 2x DOUBLE BOX)
- ✅ Tracking Dokumen Penting (KIR, PAJAK STNK, PLAT)
- ✅ Expiration Alerts & Reminders
- ✅ Service History & Maintenance Logs
- ✅ Auto-calculated expiration status
- ✅ Modern responsive UI dengan dark mode support

---

## Installation & Setup

### Step 1: Run Database Migration

```bash
# Navigate to project directory
cd d:\DOWNLOAD\ARSIPHOSTING\arsipcloudflre

# Run migration script
node backend/execute-fleet-management-migration.js
```

**Expected Output:**
```
================================================
🚀 Fleet Management Tables Migration
================================================

📖 SQL file content loaded

⏳ Executing: CREATE TABLE IF NOT EXISTS vehicles...
   ✅ Success
⏳ Executing: CREATE TABLE IF NOT EXISTS vehicle_documents...
   ✅ Success
⏳ Executing: CREATE TABLE IF NOT EXISTS vehicle_maintenance...
   ✅ Success

================================================
✅ Migration Summary
   Executed: 12 statements
   Successful: 12
   Warnings/Errors: 0
================================================
```

### Step 2: Restart Backend Server

```bash
# If server is running, stop it (Ctrl+C)
# Then restart:
npm start
# or
node backend/server.js
```

### Step 3: Access Fleet Management

Open browser and navigate to:
```
http://localhost:5000/fleet
```

Or click "Fleet Management" in the sidebar menu.

---

## Testing Checklist

### Phase 1: Database & API Testing

#### Test 1.1: Check Database Tables
```bash
# In Supabase SQL Editor, run:
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('vehicles', 'vehicle_documents', 'vehicle_maintenance');
```

**Expected Result:**
```
vehicles
vehicle_documents
vehicle_maintenance
```

#### Test 1.2: Test Vehicles API - Create

```bash
curl -X POST http://localhost:5000/api/fleet/vehicles \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plate_number": "B 1234 ABC",
    "vehicle_type": "T120SS BOX",
    "vehicle_name": "Truck Anka 01",
    "brand_model": "Isuzu Panther",
    "year_manufacture": 2023,
    "color": "Putih",
    "engine_number": "ENG-12345",
    "notes": "Kendaraan baru"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "plate_number": "B 1234 ABC",
    "vehicle_type": "T120SS BOX",
    "vehicle_name": "Truck Anka 01",
    "is_active": true,
    "created_at": "2024-...",
    "updated_at": "2024-..."
  },
  "message": "Kendaraan B 1234 ABC berhasil ditambahkan"
}
```

#### Test 1.3: Test Vehicles API - Get List

```bash
curl -X GET http://localhost:5000/api/fleet/vehicles \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-1",
      "plate_number": "B 1234 ABC",
      "vehicle_type": "T120SS BOX",
      "vehicle_name": "Truck Anka 01",
      "is_active": true
    }
  ],
  "count": 1
}
```

#### Test 1.4: Test Documents API - Create

```bash
curl -X POST http://localhost:5000/api/fleet/documents \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vehicle_id": "uuid-from-test-1.2",
    "plate_number": "B 1234 ABC",
    "document_type": "KIR",
    "issue_date": "2023-01-15",
    "expiration_date": "2025-01-15",
    "document_number": "KIR-2023-001",
    "issued_by": "Balai Pengujian Kendaraan",
    "notes": "KIR berhasil"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-doc",
    "vehicle_id": "uuid-from-test-1.2",
    "document_type": "KIR",
    "expiration_date": "2025-01-15",
    "days_until_expiration": 180,
    "is_expired": false,
    "renewal_status": "PENDING"
  },
  "message": "Dokumen KIR berhasil ditambahkan"
}
```

#### Test 1.5: Test Documents Expiring API

```bash
curl -X GET "http://localhost:5000/api/fleet/documents/expiring?days=30" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Result:**
- Should show documents expiring within 30 days

#### Test 1.6: Test Documents Expired API

```bash
curl -X GET http://localhost:5000/api/fleet/documents/expired \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Result:**
- Should show expired documents

#### Test 1.7: Test Maintenance API - Create

```bash
curl -X POST http://localhost:5000/api/fleet/maintenance \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vehicle_id": "uuid-from-test-1.2",
    "plate_number": "B 1234 ABC",
    "maintenance_type": "SERVICE",
    "service_date": "2024-10-06",
    "description": "Service rutin berkala 10,000 km",
    "cost": 1500000,
    "odometer_reading": 10000,
    "maintenance_provider": "Bengkel Resmi Isuzu",
    "parts_replaced": "Filter oli, filter bensin",
    "next_service_date": "2024-11-06"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-maint",
    "vehicle_id": "uuid-from-test-1.2",
    "maintenance_type": "SERVICE",
    "service_date": "2024-10-06",
    "cost": 1500000,
    "created_at": "2024-..."
  },
  "message": "Maintenance record berhasil ditambahkan"
}
```

### Phase 2: UI Testing

#### Test 2.1: Dashboard Load
1. Go to http://localhost:5000/fleet
2. Check if page loads without errors
3. Verify dark mode toggle works
4. Check stats cards display (Total Vehicles, Expired Docs, Expiring Docs)

#### Test 2.2: Add Vehicle via UI
1. Click "Tambah Kendaraan" button
2. Fill form with:
   - Nomor Plat: B 5678 XYZ
   - Tipe: DOUBLE BOX
   - Nama: Truck Anka 02
   - Brand: Isuzu
   - Tahun: 2024
3. Click "Simpan Kendaraan"
4. Verify success notification appears
5. Verify vehicle appears in vehicles list

#### Test 2.3: Vehicle Cards Display
1. Check that vehicle cards show:
   - Plate number
   - Vehicle type badge
   - Document status badges (KIR, PAJAK STNK, PLAT)
   - Color coding (green valid, yellow expiring, red expired)
   - Add Document & Service buttons

#### Test 2.4: Add Document via UI
1. Click "Dokumen" button on any vehicle card
2. Fill form:
   - Kendaraan: (auto-selected)
   - Jenis Dokumen: KIR
   - Tanggal Penerbitan: 2023-06-01
   - Tanggal Expired: 2025-06-01
   - Nomor Dokumen: KIR-123456
3. Click "Simpan Dokumen"
4. Verify document appears in vehicle card badges

#### Test 2.5: Tabs Navigation
1. Click "Dokumen Penting" tab
   - Should show table with all documents
   - Verify columns: Kendaraan, Tipe Dokumen, Expired, Sisa Hari, Status, Aksi
2. Click "Akan Expired" tab
   - Should show only docs expiring in 30 days
   - Should have alert banner
3. Click "Sudah Expired" tab
   - Should show expired documents
   - Should have error alert banner

#### Test 2.6: Add Maintenance via UI
1. Click "Service" button on any vehicle card
2. Fill form:
   - Tipe: SERVICE
   - Tanggal Service: (today)
   - Deskripsi: Service rutin
   - Biaya: 1500000
   - Service Provider: Bengkel
   - Onderdil: Filter oli, Filter bensin
3. Click "Simpan Record"
4. Verify success notification

#### Test 2.7: Dark Mode Toggle
1. Click dark mode toggle
2. Verify all colors change appropriately
3. Refresh page
4. Verify dark mode persists
5. Toggle back to light mode

### Phase 3: Data Validation

#### Test 3.1: Required Fields Validation
1. Try adding vehicle without Nomor Plat
   - Should show error message
2. Try adding document without expiration date
   - Should show error message
3. Try adding maintenance without description
   - Should show error message

#### Test 3.2: Date Calculations
1. Create document with:
   - Issue Date: 2023-01-01
   - Expiration Date: 2025-01-01
2. Check if "Sisa Hari" shows approximately 450+ days
3. Create document expiring tomorrow
4. Check if it shows in "Akan Expired" tab
5. Create document expiring yesterday
6. Check if it shows in "Sudah Expired" tab with red badge

#### Test 3.3: Unique Plate Numbers
1. Try creating vehicle with duplicate plate number
   - Should show database error
2. Verify only one vehicle with same plate exists

### Phase 4: Performance Testing

#### Test 4.1: Load Multiple Vehicles
1. Add 10+ vehicles via API
2. Check if dashboard still loads quickly
3. Verify no console errors
4. Check pagination/filtering if implemented

#### Test 4.2: Search/Filter Performance
1. If search implemented, test with 50+ documents
2. Verify response time < 2 seconds

---

## Sample Test Data (untuk manual testing)

### 5 Kendaraan Armada:

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

### Dokumen per Kendaraan:

Setiap kendaraan harus punya:
- 1 KIR (Kendaraan Bermotor)
- 1 PAJAK_STNK (Pajak & STNK)
- 1 PLAT

---

## Troubleshooting

### Problem: "Table does not exist" error
**Solution:**
1. Check if migration was run successfully
2. Go to Supabase SQL Editor
3. Manually copy & paste content from `backend/CREATE_FLEET_MANAGEMENT_TABLES.sql`
4. Click Run
5. Restart backend server

### Problem: "Fleet Management" menu not showing
**Solution:**
1. Clear browser cache (Ctrl+Shift+Delete)
2. Hard refresh page (Ctrl+Shift+R)
3. Verify sidebar.js was updated with fleet route

### Problem: API returns 401 Unauthorized
**Solution:**
1. Check if JWT token is valid
2. Verify token is not expired
3. Login again to get new token
4. Pass token in Authorization header

### Problem: Notifications not showing
**Solution:**
1. Check if notification-system.js is loaded
2. Open browser console
3. Type `Notify.success('Test')` to verify
4. If not working, check js folder permissions

---

## Deployment Checklist

- [ ] Database migration executed successfully
- [ ] All 3 tables created (vehicles, vehicle_documents, vehicle_maintenance)
- [ ] Backend server restarted
- [ ] Fleet Management route accessible at /fleet
- [ ] Menu item shows in sidebar
- [ ] Can create vehicles
- [ ] Can add documents
- [ ] Can add maintenance records
- [ ] Document expiration tracking works
- [ ] Alerts show correctly
- [ ] Dark mode works
- [ ] No console errors

---

## Files Modified

1. **backend/CREATE_FLEET_MANAGEMENT_TABLES.sql** - Database schema
2. **backend/fleet-management-endpoints.js** - API endpoints
3. **backend/execute-fleet-management-migration.js** - Migration script
4. **backend/server.js** - Route registration + fleet routes
5. **fleet-dashboard.html** - UI dashboard
6. **js/sidebar.js** - Menu item addition

---

## API Endpoints Reference

### Vehicles
- `GET /api/fleet/vehicles` - List all vehicles
- `GET /api/fleet/vehicles/:id` - Get vehicle details
- `POST /api/fleet/vehicles` - Create vehicle
- `PUT /api/fleet/vehicles/:id` - Update vehicle

### Documents
- `POST /api/fleet/documents` - Create document
- `PUT /api/fleet/documents/:id` - Update document
- `DELETE /api/fleet/documents/:id` - Delete document
- `GET /api/fleet/documents/expiring?days=30` - Get expiring documents
- `GET /api/fleet/documents/expired` - Get expired documents

### Maintenance
- `GET /api/fleet/maintenance/:vehicleId` - Get maintenance history
- `POST /api/fleet/maintenance` - Create maintenance record
- `PUT /api/fleet/maintenance/:id` - Update maintenance record
- `DELETE /api/fleet/maintenance/:id` - Delete maintenance record

---

## Support & Issues

If you encounter issues:
1. Check browser console for errors (F12)
2. Check backend logs in terminal
3. Verify database connection in Supabase
4. Check .env file has correct credentials
5. Restart server and try again

Good luck! 🚀
