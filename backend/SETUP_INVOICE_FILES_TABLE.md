# Setup: invoice_files Table for File Counter Fix

## Problem
The file counter was stuck at `0/3` even after uploading invoice PDF, bukti bayar, and faktur pajak. Root cause: the backend tried to update non-existent columns (`bukti_bayar_path`, `faktur_pajak_path`).

## Solution
Create a new `invoice_files` table to track individual file uploads (one-to-many relationship):
- `invoice_files.faktur` → `invoice_file_list.faktur` (foreign key)
- `invoice_files.file_type` → 'invoice', 'bukti_bayar', or 'faktur_pajak'
- `invoice_files.file_path` → path in R2 storage

## How It Works

### Before (Broken)
```
invoice_file_list
├── uploaded_file_path: ARSIP/BEKASI/PPN/2026/SEPTEMBER/02/835100311020926004.pdf
├── bukti_bayar_path: ❌ DOESN'T EXIST (UPDATE fails silently)
├── faktur_pajak_path: ❌ DOESN'T EXIST (UPDATE fails silently)
└── Counter stuck at: 1/3
```

### After (Fixed)
```
invoice_file_list
├── id: 13548a3b-5f46-43ce...
├── faktur: 835100311020926004
└── ...

invoice_files (NEW TABLE)
├── (1) faktur: 835100311020926004, file_type: 'invoice', file_path: ARSIP/BEKASI/PPN/...
├── (2) faktur: 835100311020926004, file_type: 'bukti_bayar', file_path: ARSIP/BEKASI/bukti-bayar/...
├── (3) faktur: 835100311020926004, file_type: 'faktur_pajak', file_path: ARSIP/BEKASI/faktur-pajak/...
└── Counter shows: 3/3 ✅
```

## IMPORTANT: Execute the SQL

⚠️ The SQL file has been created but the table might not exist yet. You need to manually execute it:

### Method 1: Supabase Web UI (Recommended)
1. Go to https://app.supabase.com/project/[YOUR_PROJECT]/sql
2. Click "New Query"
3. Copy and paste the SQL from `backend/CREATE_INVOICE_FILES_TABLE.sql`
4. Click "Run"
5. Check "✅ Success"

### Method 2: SQL File Execution
```bash
# Option A: Copy entire file contents and paste in Supabase SQL Editor
cat backend/CREATE_INVOICE_FILES_TABLE.sql

# Option B: Using psql (if you have PostgreSQL CLI)
psql "postgresql://[user]:[password]@[host]/[database]" < backend/CREATE_INVOICE_FILES_TABLE.sql
```

## What the SQL Does

```sql
CREATE TABLE invoice_files (
    id UUID PRIMARY KEY,                           -- Unique ID per file record
    faktur VARCHAR(50) NOT NULL,                   -- Links to invoice
    file_type VARCHAR(50) NOT NULL,                -- 'invoice', 'bukti_bayar', 'faktur_pajak'
    file_path TEXT NOT NULL,                       -- Path in R2 storage
    file_size BIGINT,                              -- File size (for stats)
    uploaded_by UUID,                              -- Who uploaded it
    uploaded_at TIMESTAMP,                         -- When it was uploaded
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(faktur, file_type)                      -- Prevent duplicate file types per invoice
);

CREATE INDEXES:
- idx_invoice_files_faktur                    → Fast lookups by faktur
- idx_invoice_files_file_type                 → Fast lookups by file type
- idx_invoice_files_faktur_type               → Fast lookups by faktur + type
- idx_invoice_files_uploaded_at               → Fast sorting by date
```

## Backend Changes

All backend code already updated to use this table:

### File Upload Endpoints
- **Invoice PDF Upload** → `INSERT INTO invoice_files (file_type='invoice', ...)`
- **Bukti Bayar Upload** → `INSERT INTO invoice_files (file_type='bukti_bayar', ...)`
- **Faktur Pajak Upload** → `INSERT INTO invoice_files (file_type='faktur_pajak', ...)`

All use UPSERT (will update if same faktur+file_type already exists).

### Check-File Endpoint
- **Query**: `SELECT * FROM invoice_files WHERE faktur=? AND file_type=?`
- **Fallback**: If table doesn't exist, use `uploaded_file_path` column (OLD method)
- **Result**: Returns correct file count

### File Counter Function
- **New method**: Count from `invoice_files` table
- **Fallback**: Count from `uploaded_file_path` column (OLD method)
- **Result**: Accurate count 1/3 → 2/3 → 3/3

## Testing After Setup

### Manual Test
1. Upload invoice PDF for faktur `835100311020926004`
   - Dashboard should show: **1/3** ✅
   
2. Upload bukti bayar for same faktur
   - Dashboard should show: **2/3** ✅
   
3. Upload faktur pajak (if PPN invoice)
   - Dashboard should show: **3/3** ✅

### Verify in Database
```sql
-- Check inserted files
SELECT faktur, file_type, file_path, uploaded_at 
FROM invoice_files 
WHERE faktur = '835100311020926004'
ORDER BY file_type;

-- Should show 3 rows (or 2 if not PPN)
```

## Backwards Compatibility

✅ All changes are backwards compatible:
- If `invoice_files` table doesn't exist → Use `uploaded_file_path` (OLD method)
- If `invoice_files` table exists → Use it (NEW method)
- No existing data is deleted or modified
- No breaking changes to API

## Rollback (if needed)

If something goes wrong, rollback is simple:
```sql
DROP TABLE IF EXISTS invoice_files CASCADE;
```

The backend will automatically fall back to the OLD method using `uploaded_file_path`.

## Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Backend code | ✅ Ready | Already deployed and running |
| SQL schema | ⏳ Needs manual execution | See "Execute the SQL" section above |
| File uploads | 🔄 Will work with either method | Uses invoice_files if available, falls back to OLD schema |
| File counter | 🔄 Will work with either method | Counts from invoice_files if available, falls back to OLD schema |
| Dashboard | 🔄 Will show correct count | Once table is created and synced |

---

**Next Action**: Execute the SQL in Supabase to create the `invoice_files` table. Once created, test by uploading files - the counter should increment correctly!
