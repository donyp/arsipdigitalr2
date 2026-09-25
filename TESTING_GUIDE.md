# Testing Guide - R2 Upload Fixes

## Overview
This guide walks through testing the three fixes:
1. ✅ Folder paths now use correct names (bukti-bayar, Faktur-Pajak)
2. ✅ Duplicate detection works in realtime (no cache)
3. ✅ File counter updates correctly (1/3 → 2/3 → 3/3)

## Prerequisites

1. **Database Migration Complete**
   - Execute `MIGRATION_ADD_FILE_PATHS.sql` in Supabase SQL Editor
   - See `MIGRATION_INSTRUCTIONS.md` for details
   - Verify 3 new columns exist: `invoice_pdf_path`, `bukti_bayar_path`, `faktur_pajak_path`

2. **Backend Running**
   ```bash
   cd backend
   npm install
   node server.js
   ```

3. **R2 Credentials Configured**
   - Verify `.env` has: `CLOUDFLARE_R2_BUCKET=ankadigital`
   - Verify R2 credentials are set

## Test Scenario

### Setup: Create Test Invoice

1. Navigate to dashboard admin
2. Create new invoice with these details:
   - **Faktur**: `TEST-835100311-001` (unique)
   - **Toko**: MEGA BAJA PASAR KEMIS
   - **Zona**: BEKASI
   - **Jenis**: PPN
   - **Total**: 1,000,000

3. Verify invoice appears in list with status **0/3**

---

## Test 1: Invoice PDF Upload (1/3)

### Steps:
1. Go to "Upload Invoice PDF"
2. Create test PDF file named: `TEST-835100311-001.pdf`
3. Upload the file

### Expected Results:

**File Path in R2:**
```
✅ Should be: ARSIP/BEKASI/PPN/2026/SEPTEMBER/DD/TEST-835100311-001.pdf
❌ NOT: ARSIPINVOICE/BEKASI/2026/SEPTEMBER/DD/PPN/TEST-835100311-001.pdf
```

**Database Update:**
```sql
SELECT invoice_pdf_path, bukti_bayar_path, faktur_pajak_path 
FROM invoice_file_list 
WHERE faktur = 'TEST-835100311-001';
```
✅ `invoice_pdf_path` should be populated

**Dashboard Display:**
```
✅ Status should show: 1/3
❌ NOT: 0/3
```

**Browser Console:**
```
✅ Should see: [R2] ✅ Successfully uploaded: ARSIP/BEKASI/PPN/...
✅ Should NOT see: checkFileExists (cached) - should use checkFileExistsNoCache
```

---

## Test 2: Bukti Bayar Upload (2/3)

### Steps:
1. Go to "Upload Documents"
2. Select "Bukti Bayar" type
3. Upload test PDF named: `bukti-bayar-TEST-835100311-001.pdf`

### Expected Results:

**File Path in R2:**
```
✅ Should be: ARSIP/BEKASI/bukti-bayar/2026/SEPTEMBER/DD/bukti-bayar-TEST-835100311-001.pdf
❌ NOT: ARSIP/BEKASI/BUKTIBAYAR/2026/SEPTEMBER/...
```

**Database Update:**
```sql
SELECT bukti_bayar_path FROM invoice_file_list 
WHERE faktur = 'TEST-835100311-001';
```
✅ `bukti_bayar_path` should be populated

**Dashboard Display:**
```
✅ Status should show: 2/3
❌ NOT: 1/3 (should have incremented)
```

---

## Test 3: Faktur Pajak Upload (3/3)

### Steps:
1. Go to "Upload Documents"
2. Select "Faktur Pajak" type
3. Upload test PDF named: `tax-TEST-835100311-001.pdf`

### Expected Results:

**File Path in R2:**
```
✅ Should be: ARSIP/BEKASI/Faktur-Pajak/2026/SEPTEMBER/DD/tax-TEST-835100311-001.pdf
❌ NOT: ARSIP/BEKASI/FAKTURPAJAK/2026/SEPTEMBER/...
```

**Database Update:**
```sql
SELECT faktur_pajak_path FROM invoice_file_list 
WHERE faktur = 'TEST-835100311-001';
```
✅ `faktur_pajak_path` should be populated

**Dashboard Display:**
```
✅ Status should show: 3/3 ← ALL FILES UPLOADED
❌ NOT: 2/3
```

---

## Test 4: Duplicate Detection (Realtime)

### Steps:
1. Try uploading the same `TEST-835100311-001.pdf` again
2. Attempt to upload same `bukti-bayar-TEST-835100311-001.pdf` again

### Expected Results:

**Error Message:**
```
✅ Should see: "File already exists: ARSIP/BEKASI/PPN/.../TEST-835100311-001.pdf"
❌ NOT: Silent success (which would indicate cache issue)
```

**API Response:**
```json
{
  "error": "File already exists: ARSIP/BEKASI/PPN/2026/SEPTEMBER/DD/TEST-835100311-001.pdf",
  "code": "DUPLICATE_FILE"
}
```

**Backend Console:**
```
✅ Should see: [R2] Uploading invoice PDF: ARSIP/BEKASI/PPN/...
✅ Should see: [R2] File already exists: ... (DUPLICATE_FILE)
❌ NOT: Should NOT see cache hit message
```

**Verification:**
```bash
# Check backend is using checkFileExistsNoCache
grep -n "checkFileExistsNoCache" backend/r2-storage.js

# Should show 3 occurrences in upload functions:
# - uploadInvoicePDF (line ~289)
# - uploadDocumentFile (line ~359)
# - uploadFileToRemote (line ~410)
```

---

## Test 5: API Endpoint - Check File

### Test Individual File Checks

```bash
# Test 1: Check invoice file (after upload 1/3)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/invoice/check-file/TEST-835100311-001/invoice

# Expected Response:
{
  "exists": true,
  "faktur": "TEST-835100311-001",
  "fileType": "invoice",
  "filePath": "ARSIP/BEKASI/PPN/2026/SEPTEMBER/DD/TEST-835100311-001.pdf",
  "fileCount": {
    "uploaded": 1,
    "required": 3,
    "status": "1/3"
  }
}

# Test 2: Check bukti_bayar (after upload 2/3)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/invoice/check-file/TEST-835100311-001/bukti_bayar

# Expected:
{
  "exists": true,
  "fileCount": {
    "status": "2/3"
  }
}

# Test 3: Check faktur_pajak (after upload 3/3)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/invoice/check-file/TEST-835100311-001/faktur_pajak

# Expected:
{
  "exists": true,
  "fileCount": {
    "status": "3/3"
  }
}

# Test 4: Check file that doesn't exist
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/invoice/check-file/TEST-835100311-001/bukti_bayar \
  (before uploading bukti_bayar)

# Expected:
{
  "exists": false,
  "fileCount": {
    "status": "1/3"
  }
}
```

---

## Test 6: Verify File Count Endpoint

```bash
# Manually verify file count is correct
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/invoice/verify-file-count/TEST-835100311-001

# Expected Response:
{
  "faktur": "TEST-835100311-001",
  "actualCount": 3,
  "dbCount": 3,
  "isCorrect": true,
  "message": "File count is correct"
}
```

---

## Test 7: Browser Console Checks

Open browser DevTools Console and verify:

### After Invoice PDF Upload:
```
✅ [PDF Bulk] ✓ Uploaded: 835100311020926004
✅ [Dashboard] Status updated to 1/3
```

### After Bukti Bayar Upload:
```
✅ [Invoice Document BG] ✅ Bukti Bayar uploaded
✅ Status should increment from 1/3 to 2/3
```

### After Faktur Pajak Upload:
```
✅ [Invoice Faktur Pajak BG] ✅ File uploaded
✅ Status should reach 3/3 (complete)
```

---

## Database Verification

Run these queries in Supabase SQL Editor to verify data:

### 1. Check all three columns populated:
```sql
SELECT 
    faktur,
    invoice_pdf_path,
    bukti_bayar_path,
    faktur_pajak_path,
    files_uploaded_count,
    keterangan
FROM invoice_file_list 
WHERE faktur = 'TEST-835100311-001';
```

**Expected:**
- All three `*_path` columns populated
- `files_uploaded_count = 3`
- Each path follows format: `ARSIP/BEKASI/{TYPE}/2026/SEPTEMBER/DD/filename.pdf`

### 2. Verify indexes created:
```sql
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'invoice_file_list' 
AND indexname LIKE 'idx_invoice_file_list_%path';
```

**Expected:** 3 indexes
- `idx_invoice_file_list_invoice_pdf_path`
- `idx_invoice_file_list_bukti_bayar_path`
- `idx_invoice_file_list_faktur_pajak_path`

### 3. Check backward compatibility:
```sql
SELECT 
    faktur,
    uploaded_file_path,
    invoice_pdf_path
FROM invoice_file_list 
WHERE faktur = 'TEST-835100311-001';
```

**Expected:** `uploaded_file_path` and `invoice_pdf_path` should be identical (for now)

---

## Cleanup After Testing

```sql
-- Delete test invoice
DELETE FROM invoice_file_list 
WHERE faktur LIKE 'TEST-%';

-- Delete test files from R2 (via Cloudflare dashboard)
-- Path: ARSIP/BEKASI/{PPN|bukti-bayar|Faktur-Pajak}/2026/SEPTEMBER/DD/TEST-*
```

---

## Troubleshooting

### Issue: Status still shows 0/3 after upload

**Check:**
1. Did you run the migration? Verify columns exist:
   ```sql
   \d invoice_file_list  -- in psql
   ```
2. Is backend using new columns?
   ```bash
   grep -n "invoice_pdf_path" backend/invoice-endpoints.js
   ```
3. Check console for errors:
   ```
   [Invoice PDF BG] Update error: ...
   ```

### Issue: Can re-upload same file (duplicate detection not working)

**Check:**
1. Backend is using `checkFileExistsNoCache()`:
   ```bash
   grep "checkFileExistsNoCache" backend/r2-storage.js
   ```
2. R2 credentials are valid
3. File actually exists in R2:
   ```bash
   # Check via Cloudflare dashboard
   # Path should be: ARSIP/BEKASI/PPN/2026/SEPTEMBER/DD/filename.pdf
   ```

### Issue: File path is wrong (e.g., BUKTIBAYAR instead of bukti-bayar)

**Check:**
1. Code was committed: `git log --oneline | head`
2. Verify r2-storage.js line ~352:
   ```bash
   grep -n "bukti-bayar\|Faktur-Pajak" backend/r2-storage.js
   ```
3. Restart backend: `node server.js`

### Issue: File count shows 2/3 instead of 3/3 after upload

**Check:**
1. Did database columns get updated?
   ```sql
   SELECT invoice_pdf_path, bukti_bayar_path, faktur_pajak_path 
   FROM invoice_file_list WHERE faktur = 'YOUR-FAKTUR';
   ```
2. Are all paths populated (not NULL)?
3. Check for database update errors in backend console:
   ```
   [Invoice PDF BG] Update error: ...
   [Invoice Document BG] Update error: ...
   ```

---

## Success Criteria

All tests pass when:

✅ Path format is correct (ARSIP/{LOCATION}/{TYPE}/...)
- Invoice: `ARSIP/BEKASI/PPN/...` (not ARSIPINVOICE)
- Bukti: `ARSIP/BEKASI/bukti-bayar/...` (not BUKTIBAYAR - lowercase with hyphen)
- Faktur: `ARSIP/BEKASI/Faktur-Pajak/...` (not FAKTURPAJAK - Title-case with hyphen)

✅ Duplicate detection works realtime
- Cannot re-upload same file (gets error)
- Error shows immediately (no 5-min cache delay)

✅ File counter updates correctly
- After PDF upload: 1/3
- After bukti upload: 2/3
- After faktur upload: 3/3
- Never goes backwards

✅ Database has correct data
- Three separate columns track each file
- All paths follow correct format
- No NULL values when files uploaded

✅ API endpoints return correct status
- `/api/invoice/check-file/:faktur/:fileType` returns `fileCount` with status

---

## Performance Notes

- **Duplicate Detection:** Now uses fresh R2 checks (no 5-min cache)
  - Trade-off: Slightly slower uploads but prevents duplicate uploads
  - Typical check time: 200-500ms per file
  
- **File Count:** Calculated from 3 separate columns
  - Fast: Direct SQL column checks
  - No need for extra queries

- **Database Indexes:** Added on all 3 path columns
  - Speeds up searches by file type
  - Recommended for large datasets (1000+ invoices)
