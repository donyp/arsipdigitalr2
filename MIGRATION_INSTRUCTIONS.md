# Database Migration: Add Multiple File Path Tracking

## Overview
This migration adds support for tracking three separate file uploads per invoice:
- `invoice_pdf_path` - Invoice PDF file
- `bukti_bayar_path` - Payment proof (Bukti Bayar)
- `faktur_pajak_path` - Tax invoice (Faktur Pajak)

Previously, the `uploaded_file_path` column only tracked ONE file. Now we track all three separately.

## Pre-requisites
- Access to Supabase SQL Editor
- Supabase project URL: https://ccfwwsmpjhxqeyxgapeb.supabase.co
- Service role credentials in `.env`

## How to Execute the Migration

### Option 1: Manual Execution (Recommended)
1. Go to Supabase Dashboard → SQL Editor
2. Create a new query
3. Copy the contents of `MIGRATION_ADD_FILE_PATHS.sql`
4. Paste into the SQL Editor
5. Click "Run"
6. Verify the output shows column additions and indexes created

### Option 2: Using Migration Runner
```bash
node backend/run-migration.js MIGRATION_ADD_FILE_PATHS.sql
```

Note: This may not work as Supabase SDK doesn't support arbitrary SQL execution. Use Option 1 instead.

## What the Migration Does

1. Adds three new columns:
   - `invoice_pdf_path TEXT` - Stores path to invoice PDF in R2
   - `bukti_bayar_path TEXT` - Stores path to bukti bayar in R2
   - `faktur_pajak_path TEXT` - Stores path to faktur pajak in R2

2. Creates a new `invoice_pdf_path` column for clarity (mirrors `uploaded_file_path`)

3. Migrates existing data from `uploaded_file_path` to `invoice_pdf_path`

4. Creates indexes on all three path columns for query performance

5. Adds comments documenting the path format for each column

## Migration Path Format

All paths follow this structure:
```
ARSIP/{LOCATION}/{TYPE}/{YEAR}/{MONTH}/{DAY}/{filename}
```

Examples:
- Invoice PDF: `ARSIP/BEKASI/PPN/2026/SEPTEMBER/02/8351003110.pdf`
- Bukti Bayar: `ARSIP/BEKASI/bukti-bayar/2026/SEPTEMBER/02/83510032310.pdf`
- Faktur Pajak: `ARSIP/BEKASI/Faktur-Pajak/2026/SEPTEMBER/02/tax-8351003110.pdf`

## Backend Code Changes

The following files have been updated to use the new columns:

### backend/r2-storage.js
- Changed duplicate detection from `checkFileExists()` to `checkFileExistsNoCache()` for realtime validation
- This ensures users cannot re-upload the same file

### backend/invoice-endpoints.js
- Fixed folder names: `BUKTIBAYAR` → `bukti-bayar`, `FAKTURPAJAK` → `Faktur-Pajak`
- Updates `invoice_pdf_path` when invoice PDF is uploaded
- Updates `bukti_bayar_path` when bukti bayar is uploaded
- Updates `faktur_pajak_path` when faktur pajak is uploaded
- Keeps `uploaded_file_path` for backward compatibility (mirrors invoice_pdf_path)

## Verification

After running the migration, verify the schema with:

```sql
-- Check new columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'invoice_file_list' 
AND column_name IN ('invoice_pdf_path', 'bukti_bayar_path', 'faktur_pajak_path');

-- Check indexes created
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'invoice_file_list' 
AND indexname LIKE 'idx_invoice_file_list_%path';

-- Check data migration
SELECT 
    COUNT(*) as total_invoices,
    COUNT(invoice_pdf_path) as with_pdf,
    COUNT(bukti_bayar_path) as with_bukti_bayar,
    COUNT(faktur_pajak_path) as with_faktur_pajak
FROM invoice_file_list;
```

## Rollback (if needed)

```sql
-- Remove new columns
ALTER TABLE invoice_file_list 
DROP COLUMN IF EXISTS invoice_pdf_path,
DROP COLUMN IF EXISTS bukti_bayar_path,
DROP COLUMN IF EXISTS faktur_pajak_path;

-- Drop indexes
DROP INDEX IF EXISTS idx_invoice_file_list_invoice_pdf_path;
DROP INDEX IF EXISTS idx_invoice_file_list_bukti_bayar_path;
DROP INDEX IF EXISTS idx_invoice_file_list_faktur_pajak_path;
```

## Timeline

- Migration: Adds 3 new columns + indexes
- Data migration: Copies existing `uploaded_file_path` to `invoice_pdf_path`
- Backward compatibility: `uploaded_file_path` kept for now
- Future: Can deprecate `uploaded_file_path` after confirming all code uses new columns

## Testing Checklist

After migration, test these scenarios:

1. ✅ Upload invoice PDF → verify `invoice_pdf_path` is set, status shows 1/3
2. ✅ Upload bukti bayar → verify `bukti_bayar_path` is set, status shows 2/3
3. ✅ Upload faktur pajak → verify `faktur_pajak_path` is set, status shows 3/3
4. ✅ Try uploading duplicate file → should get error "File already exists"
5. ✅ Verify file paths use correct folders:
   - Invoice PDF: `ARSIP/BEKASI/PPN/...` or `ARSIP/BEKASI/NON/...`
   - Bukti Bayar: `ARSIP/BEKASI/bukti-bayar/...` (lowercase with hyphen)
   - Faktur Pajak: `ARSIP/BEKASI/Faktur-Pajak/...` (Title case with hyphen)

## Support

If migration fails:
1. Check Supabase SQL Editor for error messages
2. Verify permissions on Supabase account
3. Run verification SQL to see current state
4. Contact support with error message and current schema state
