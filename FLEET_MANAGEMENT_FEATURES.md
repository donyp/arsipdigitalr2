# Fleet Management - Feature Overview

## System Features

### 1. 🚛 Vehicle Management
**Manage your fleet of 5 vehicles:**

- **Vehicle Types:**
  - T120SS BOX (1 unit)
  - TRAGA BOX (1 unit)
  - ENGKEL BOX (1 unit)
  - DOUBLE BOX (2 units)

- **Vehicle Information Tracked:**
  - Plate Number (unique)
  - Type & Name
  - Brand & Model
  - Year of Manufacture
  - Color
  - Engine Number
  - Chassis Number
  - Purchase Date
  - Status (Active/Inactive)
  - Notes

---

### 2. 📋 Document Management
**Track important vehicle documents:**

#### Document Types:
1. **KIR** - Kendaraan Bermotor
   - Required for roadworthiness
   - Typically valid 1 year
   - Usually checked annually

2. **PAJAK_STNK** - Pajak & STNK
   - Vehicle tax & registration
   - Typically valid 1-5 years
   - Auto-renewal available

3. **PLAT** - License Plate
   - Vehicle registration plate
   - Typically lifetime
   - Replace if damaged/lost

#### Document Fields:
- Document Type
- Issue Date (Tanggal Penerbitan)
- Expiration Date (Tanggal Expired)
- Document Number
- Issued By (authority)
- File Path (for attachments)
- Renewal Status (PENDING/IN_PROGRESS/RENEWED/EXPIRED)
- Notes

#### Auto-Calculated Fields:
- **Days Until Expiration** - Automatically calculated
- **Is Expired** - Boolean status (auto-updated)

---

### 3. ⏰ Expiration Tracking & Alerts

#### Dashboard Stats:
```
┌─────────────────────────┐
│ Total Vehicles      5   │ ← Total armada
│ Dokumen Expired     2   │ ← Perlu tindakan segera
│ Akan Expired (30h)  3   │ ← Siap perpanjangan
└─────────────────────────┘
```

#### Status Badges:
- 🟢 **VALID** - Document still valid (gray)
- 🟡 **EXPIRING** - Expires within 30 days (yellow)
- 🔴 **EXPIRED** - Already expired (red)

#### Tabs:
1. **Semua Kendaraan** - Vehicle cards with document overview
2. **Dokumen Penting** - All documents table view
3. **Akan Expired** - Documents expiring in 30 days (with alert)
4. **Sudah Expired** - Expired documents (with error alert)

---

### 4. 🔧 Maintenance & Service History

**Track all vehicle maintenance:**

#### Maintenance Types:
1. **SERVICE** - Regular maintenance
2. **TIRE_REPLACEMENT** - Ban replacement
3. **REPAIR** - General repairs
4. **OTHER** - Other maintenance

#### Maintenance Information:
- Type of Maintenance
- Service Date
- Description
- Cost
- Odometer Reading
- Maintenance Provider (bengkel)
- Parts Replaced
- Next Service Date (recommended)
- Notes

#### Use Cases:
- Track service intervals
- Record part replacements
- Monitor maintenance costs
- Plan future service schedules
- Maintain service warranty records

---

### 5. 🎨 Modern UI Features

#### Dashboard Design:
- **Responsive** - Works on desktop, tablet, mobile
- **Dark Mode** - Optional dark theme support
- **Color Coded** - Status badges with colors
- **Fast Loading** - Optimized for performance

#### Vehicle Cards:
```
┌──────────────────────────────┐
│ 🚛 T120SS BOX               │
│                              │
│ B 1111 ABC                  │
│ Truck T120 01               │
│ Isuzu T120SS, 2023          │
│                              │
│ [KIR ✓] [PAJAK ⚠️] [PLAT ✗] │
│                              │
│ [+ Dokumen]  [+ Service]    │
└──────────────────────────────┘
```

#### Modal Forms:
- Clean modal dialogs
- Form validation
- Auto-populate vehicle selection
- Real-time feedback

---

### 6. 🔐 Security & Access Control

#### Role-Based Access:
- **super_admin** - Full access (create, edit, delete all)
- **moderator** - Full access (create, edit, delete all)
- **Others** - Read-only (view vehicles, documents, history)

#### Data Security:
- JWT token authentication required
- Row-level security enabled on all tables
- Audit trail on created_by, updated_by fields
- Timestamps on all records

---

## Data Model

### Database Schema:

#### vehicles
```sql
id (UUID, PK)
plate_number (VARCHAR 20, UNIQUE) ← Must be unique per vehicle
vehicle_type (VARCHAR 50) → T120SS BOX | TRAGA BOX | ENGKEL BOX | DOUBLE BOX
vehicle_name (VARCHAR 100)
brand_model (VARCHAR 100)
year_manufacture (INTEGER)
color (VARCHAR 50)
engine_number (VARCHAR 50)
chassis_number (VARCHAR 50)
vin (VARCHAR 100)
purchase_date (DATE)
is_active (BOOLEAN)
notes (TEXT)
created_at, updated_at (TIMESTAMP)
created_by, updated_by (UUID)
```

#### vehicle_documents
```sql
id (UUID, PK)
vehicle_id (UUID, FK → vehicles)
plate_number (VARCHAR 20)
document_type (VARCHAR 50) → KIR | PAJAK_STNK | PLAT
issue_date (DATE)
expiration_date (DATE)
document_number (VARCHAR 100)
issued_by (VARCHAR 100)
document_file_path (TEXT)
days_until_expiration (INTEGER, AUTO-GENERATED)
is_expired (BOOLEAN, AUTO-GENERATED)
renewal_status (VARCHAR 50) → PENDING | IN_PROGRESS | RENEWED | EXPIRED
renewal_date (DATE)
notes (TEXT)
created_at, updated_at (TIMESTAMP)
created_by, updated_by (UUID)
```

#### vehicle_maintenance
```sql
id (UUID, PK)
vehicle_id (UUID, FK → vehicles)
plate_number (VARCHAR 20)
maintenance_type (VARCHAR 50) → SERVICE | TIRE_REPLACEMENT | REPAIR | OTHER
service_date (DATE)
description (TEXT)
cost (DECIMAL 15,2)
odometer_reading (INTEGER)
maintenance_provider (VARCHAR 100)
next_service_date (DATE)
parts_replaced (TEXT)
notes (TEXT)
maintenance_file_path (TEXT)
created_at, updated_at (TIMESTAMP)
created_by, updated_by (UUID)
```

---

## Workflow Examples

### Example 1: KIR Renewal Workflow

1. **Staff checks "Akan Expired" tab**
   - Sees KIR for truck B 1111 ABC expiring in 10 days
   - Alert shown: "Siap untuk perpanjangan"

2. **Staff adds new KIR document**
   - Issue Date: today
   - Expiration Date: +1 year
   - Status: RENEWED

3. **System updates automatically**
   - Old document status: EXPIRED
   - New document status: PENDING (or VALID)
   - Removed from "Akan Expired" tab
   - Added to "Dokumen Penting" tab

### Example 2: Service Tracking

1. **Truck brought to workshop**
   - Staff opens fleet dashboard
   - Clicks "Service" button on truck card

2. **Staff logs maintenance**
   - Type: SERVICE
   - Date: Today
   - Description: Ganti oli, filter, ban depan
   - Cost: Rp 1,500,000
   - Provider: Bengkel Isuzu Resmi
   - Next Service: 30 days from now
   - Odometer: 50,000 km

3. **System records history**
   - Service added to vehicle history
   - Next service date tracked
   - Costs tracked for budget planning

### Example 3: Tire Replacement

1. **Ban depan kanan sobek**
   - Staff logs maintenance: TIRE_REPLACEMENT
   - Date: Today
   - Parts: Ban depan kanan (merk Bridgestone)
   - Cost: Rp 1,200,000

2. **History maintained**
   - Can view all tire replacements
   - Track tire replacement patterns
   - Plan tire budget

---

## Benefits

✅ **Never miss important document renewals**
- Automatic expiration tracking
- Alert system for documents expiring soon
- Clear "Sudah Expired" warning

✅ **Maintenance history at a glance**
- Know when each truck was serviced last
- Plan maintenance schedules
- Track maintenance costs per vehicle

✅ **Reduce administrative burden**
- No more manual checking of expiration dates
- Digital records replace paper
- Quick access to vehicle information

✅ **Easy staff onboarding**
- New staff can quickly learn vehicle status
- Clear visual indicators (badges, colors)
- No confusion about which documents are valid

✅ **Better compliance**
- All documents tracked
- Renewal dates never missed
- Audit trail available

✅ **Cost optimization**
- Track maintenance costs
- Identify cost patterns
- Plan budget better

---

## Quick Reference - Common Tasks

### Add a new vehicle:
1. Click "Tambah Kendaraan"
2. Fill: Plate, Type, Name
3. Optional: Brand, Year, Color, etc.
4. Save

### Add a document:
1. Click "Dokumen" on vehicle card
2. Select vehicle (auto-filled)
3. Choose document type (KIR/PAJAK/PLAT)
4. Enter issue & expiration dates
5. Save

### Log a service:
1. Click "Service" on vehicle card
2. Select maintenance type
3. Enter date & description
4. Optional: cost, provider, parts
5. Save

### Check expiring documents:
1. Click "Akan Expired" tab
2. See all docs expiring in 30 days
3. Plan renewal actions

### Check expired documents:
1. Click "Sudah Expired" tab
2. See all expired docs
3. Prioritize renewals

---

## Future Enhancements

Fitur yang bisa ditambahkan:
- [ ] Document file upload (PDF/Image)
- [ ] Email notifications 7 days before expiry
- [ ] WhatsApp reminders to staff
- [ ] Budget analysis & reporting
- [ ] Maintenance cost trends
- [ ] Fuel consumption tracking
- [ ] Driver assignments per vehicle
- [ ] Maintenance cost budgeting
- [ ] Export to Excel/PDF reports
- [ ] QR code for quick vehicle lookup

---

## Support

For issues or questions:
1. Check FLEET_MANAGEMENT_SETUP_GUIDE.md for setup
2. Review API endpoints documentation
3. Check browser console for errors (F12)
4. Contact development team

Happy Fleet Managing! 🚀
