# MIGRATION REQUIRED: Add File Count Columns

**Status:** ⚠️ BLOCKING - Backend cannot save file counts without these columns

## Problem
The backend correctly calculates file counts (2/3) but cannot save them to the database because the columns don't exist in `invoice_file_list` table.

Current logs show:
```
[UpdateCount] ❌ Columns don't exist yet. Need to run migration first.
[UpdateCount] Migration needed: backend/ADD_FILE_COUNT_COLUMNS.sql
```

## Solution
Run this SQL in Supabase SQL Editor:

### Step 1: Open Supabase SQL Editor
Go to: **https://app.supabase.com/project/_/sql/new**

### Step 2: Copy and Run This SQL
```sql
-- Add file count tracking columns to invoice_file_list
ALTER TABLE invoice_file_list 
ADD COLUMN IF NOT EXISTS files_uploaded_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS files_required_count INTEGER DEFAULT 2;

-- Create index for filtering by incomplete uploads
CREATE INDEX IF NOT EXISTS idx_invoice_file_list_upload_status 
ON invoice_file_list(files_uploaded_count, files_required_count)
WHERE files_uploaded_count < files_required_count;
```

### Step 3: Wait for Success
Should see: ✅ Success

### Step 4: Restart Backend
The schema cache will refresh automatically. Server will start working correctly.

## Expected Result After Migration
- Upload invoice PDF → Shows **1/3** ✅
- Upload bukti bayar → Shows **2/3** ✅
- Upload faktur pajak → Shows **3/3** ✅

## Why This Is Needed
The frontend reads `files_uploaded_count` and `files_required_count` from the database to display the counter. These columns must exist for the backend to save the calculated values.

## Files Referenced
- `backend/ADD_FILE_COUNT_COLUMNS.sql` - Migration SQL file
- `backend/invoice-endpoints.js` - Lines ~165-190 where update happens
