# Upload/Download/File-Check System Backup Snapshot

**Date**: September 1, 2026  
**Commit**: 7a34c40 (fix: Remove default zona number to prevent flash effect with wrong value)  
**Branch**: `backup/upload-system-snapshot-before-chunked`  
**Purpose**: Rollback point before implementing chunked upload optimization

---

## System Overview

This snapshot captures the current state of all file operation endpoints before performance optimization:

### Upload Endpoints (Current Implementation)
1. **POST /api/files/upload** - General document upload (PDF, 100MB max)
2. **POST /api/invoice/upload-excel** - Invoice bulk upload (Excel, 100MB max)
3. **POST /api/invoice/upload-pdf** - Invoice PDF upload (100MB max)
4. **POST /api/invoice/upload-document** - Invoice supporting docs (Bukti Bayar / Faktur Pajak)
5. **POST /api/invoice/upload-faktur-pajak** - Faktur Pajak upload
6. **POST /api/files/upload-piutang** - Piutang upload
7. **POST /api/bugs/upload** - Bug report screenshot upload

### Download Endpoints (Current Implementation)
1. **GET /api/files/download** - Download files by ID
2. **GET /api/invoice/download-file** - Download invoice files
3. **GET /api/invoice/combine-pdf** - Combine multiple PDFs

### File Availability Check (Current Implementation)
1. **RcloneStorage.checkFileExists()** - Check if file exists on Google Drive
   - Called from multiple endpoints
   - Uses `rclone ls` command
   - 30s timeout per check
   - **NO CACHING** (called 5+ times per upload)

---

## Key Files Involved

### Backend
- `backend/server.js` - Main server, general upload endpoints (lines 1889-2200, 4650-5380)
- `backend/invoice-endpoints.js` - Invoice-specific endpoints (lines 197-1900)
- `backend/rclone_wrapper.js` - Storage abstraction layer
  - `remoteFileExists()` - Basic file check (line 180)
  - `checkFileExists()` - Public API (line 1413)
  - `uploadInvoicePDF()` - PDF upload logic
  - `uploadDocument()` - Document upload logic
- `backend/local_storage.js` - Local temp storage during upload

### Frontend
- `js/upload-piutang.js` - Piutang upload UI
- Form uploads in HTML files (implicit, via multer)

---

## Current Architecture & Flow

### Upload Flow (Synchronous)
```
1. Client submits file via form
   ↓
2. Multer receives file to memory buffer (entire file in RAM)
   ↓
3. Backend validates (size, type, filename format)
   ↓
4. Backend checks for duplicates:
   - Query database for existing file
   - If found, checkFileExists() on Google Drive (5-30 seconds)
   - If exists, reject with 409 Conflict
   ↓
5. Backend creates directory structure:
   - Sequential mkdir calls (1-2 seconds each, ~5 levels)
   ↓
6. Backend uploads file via rclone copyto (30-300 seconds for large files)
   ↓
7. Backend records in database
   ↓
8. Response sent to client (total: 30-300+ seconds)
```

### Download Flow (Sequential)
```
1. Client requests file
   ↓
2. Backend queries database for file path
   ↓
3. Backend calls rclone copyto to download to temp folder (30-60 seconds)
   ↓
4. Backend reads temp file into memory
   ↓
5. Backend streams to client and deletes temp file
```

### File Availability Check Flow
```
- Called in parallel validation before upload:
  - checkFileExists(currentPath)
  - checkFileExists(oldPath)
  - checkFileExists(duplicatePath)
  ↓
- Each call = rclone ls (sequential, ~5-10 seconds each)
- Total: 15-30 seconds wasted on checks alone
- NO CACHING means repeat check = full rclone ls again
```

---

## Current Implementation Details

### Multer Configuration
```javascript
// server.js line 367-378
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    }
});
```

### Rclone Timeout Configuration
```javascript
// rclone_wrapper.js line 268
function rcloneExec(args, timeoutMs = 30000) { // 30 seconds default
    return new Promise((resolve, reject) => {
        const child = execFile('rclone', args, {
            timeout: timeoutMs,
            maxBuffer: 1024 * 1024 * 10 // 10MB output buffer
        }, (error, stdout, stderr) => {
            // ...
        });
    });
}
```

### File Existence Check
```javascript
// rclone_wrapper.js line 180
async function remoteFileExists(storagePath) {
    const remotePath = `${PRIMARY_REMOTE}:${storagePath}`;
    try {
        await rcloneExec(['ls', remotePath]); // ~5-10 seconds per call
        return true;
    } catch (err) {
        if (/not found|error 404/i.test(err.message)) {
            return false;
        }
        throw err;
    }
}
```

### Upload Endpoint Example: /api/files/upload
```javascript
// server.js line 1889
app.post('/api/files/upload', authenticateToken, requireUploadPermission, upload.single('file'), async (req, res) => {
    // 1. Validate file exists
    // 2. Extract metadata from filename
    // 3. Check for duplicates (DB + Google Drive)
    // 4. Create directory structure
    // 5. Upload file via rclone
    // 6. Record in database
    // 7. Return response
});
```

---

## Current Performance Baseline

### Upload Latency (Single File)
- Small PDF (1-5MB): 30-60 seconds
  - 5s: Directory creation
  - 5s: File availability checks
  - 20-50s: Rclone upload
- Medium PDF (10-50MB): 60-120 seconds
  - 5s: Directory creation
  - 5s: Availability checks
  - 50-110s: Rclone upload
- Large PDF (50-100MB): 120-300+ seconds
  - 5s: Directory creation
  - 5s: Availability checks
  - 110-290s: Rclone upload

### Download Latency (Single File)
- Small PDF (1-5MB): 30-60 seconds
  - 30-60s: Rclone copyto to temp
  - 1-2s: Read and stream
- Multiple PDFs (Combine endpoint): 90-180 seconds
  - Sequential downloads: 3 × 30-60s = 90-180s

### File Check Latency
- Single check: 5-10 seconds (rclone ls)
- Per upload: 15-30 seconds (multiple checks, no caching)

---

## Error Handling (Current)

### Upload Failures
- **No retry logic** - Single attempt, no exponential backoff
- **No resume capability** - Network interruption = entire upload lost
- **Fallback behavior** - If duplicate check fails, allow re-upload (graceful)

### Download Failures
- **No retry logic** - Single attempt
- **Temp file cleanup** - May leave orphaned temp files if process crashes

### File Check Failures
- **Timeout handling** - 30s timeout, no backoff
- **Error recovery** - Graceful fallback (assume file doesn't exist if check fails)

---

## Database Schema (Current)

### invoice_file_list table
```sql
- faktur VARCHAR(50) PRIMARY KEY
- invoice_pdf_path VARCHAR(500) -- Path to Invoice PDF
- invoice_uploaded_at TIMESTAMP -- When PDF was uploaded
- faktur_pajak_path VARCHAR(500) -- Path to Faktur Pajak document
- faktur_pajak_uploaded_at TIMESTAMP
- bukti_bayar_path VARCHAR(500) -- Path to Bukti Bayar document
- bukti_bayar_uploaded_at TIMESTAMP
- uploaded_by VARCHAR(100) -- User who uploaded
- updated_at TIMESTAMP
```

### files table
```sql
- id UUID PRIMARY KEY
- nama_file VARCHAR(255)
- storage_path VARCHAR(500) -- Path on Google Drive
- ukuran_bytes BIGINT
- category VARCHAR(50) -- FILE, PIUTANG, etc
- tipe_ppn VARCHAR(20) -- PPN, NON
- tanggal_dokumen DATE
- zona_id INT
- toko_id INT
- status VARCHAR(20)
- uploaded_by VARCHAR(100)
- created_at TIMESTAMP
```

---

## Rollback Instructions

If chunked upload implementation fails, rollback to this snapshot:

### Option 1: Revert via Git (Quick)
```bash
# Revert to backup branch
git checkout backup/upload-system-snapshot-before-chunked

# Or cherry-pick last known good commit
git revert HEAD --no-edit
```

### Option 2: Manual File Restoration
Copy backup files from this snapshot:
- `backend/rclone_wrapper.js` - Original file operations
- `backend/server.js` - Original upload endpoints (lines 1889-2200, 4650-5380)
- `backend/invoice-endpoints.js` - Original invoice endpoints (lines 197-1900)

---

## Testing Points for Regression Detection

When implementing chunked upload, verify:

### Upload Operations
- [ ] Single PDF upload (1MB, 10MB, 100MB)
- [ ] Duplicate detection still works
- [ ] File paths correct in database
- [ ] File appears on Google Drive with correct structure
- [ ] Error handling for invalid files
- [ ] Error handling for network failures
- [ ] Database consistency (invoice_file_list + files tables)

### Download Operations
- [ ] Single file download
- [ ] Multiple file download
- [ ] PDF combine functionality
- [ ] Temp file cleanup

### File Checking
- [ ] checkFileExists() returns correct result
- [ ] No false positives/negatives
- [ ] Cache doesn't cause stale data issues
- [ ] Performance improvement measurable

### Database Integrity
- [ ] No orphaned records
- [ ] Uploaded_at timestamps correct
- [ ] File paths consistency
- [ ] User attribution preserved

---

## Git Commands for Reference

```bash
# View this backup branch
git log backup/upload-system-snapshot-before-chunked --oneline -5

# Checkout backup branch (entire codebase reverts)
git checkout backup/upload-system-snapshot-before-chunked

# Create new feature branch from backup (if needed to restart)
git checkout -b feature/chunked-upload-v2 backup/upload-system-snapshot-before-chunked

# View diff between current and backup
git diff master backup/upload-system-snapshot-before-chunked -- backend/
```

---

## Next Steps

1. ✅ Backup complete at commit `7a34c40`
2. Create feature branch for optimization
3. Implement cache layer (non-breaking)
4. Implement parallel checks (non-breaking)
5. Add comprehensive tests
6. Implement chunked upload (new endpoints)
7. Feature flag for gradual rollout
8. Monitor production for regression
