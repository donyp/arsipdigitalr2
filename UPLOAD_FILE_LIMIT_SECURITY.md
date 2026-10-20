# Upload File Limit Security Enhancement (50 Files)

## Overview
Meningkatkan max file upload untuk Faktur Pajak dan Bukti Bayar menjadi **50 file per batch** dengan security measures dasar.

## Changes Made

### 1. Frontend Changes

#### upload-faktur-pajak.html
- **Max Files Limit**: Tambah validasi untuk maksimal 50 file per upload
- **Location**: Function `handleFileSelect()`
- **Behavior**: 
  - Jika user pilih >50 file, tampilkan warning
  - Otomatis trim ke 50 file terakhir (FIFO)
  - User notified melalui Toast message

```javascript
const MAX_FILES = 50;
if (filesToUpload.length > MAX_FILES) {
    const excess = filesToUpload.length - MAX_FILES;
    Toast.warning(`⚠️ Maksimal ${MAX_FILES} file sekaligus. ${excess} file akan dihapus.`);
    filesToUpload = filesToUpload.slice(0, MAX_FILES);
}
```

#### upload-bukti-bayar.html
- **Max Files Limit**: Sama dengan faktur pajak
- **Location**: Function `handleFilesSelected()`
- **Behavior**: Identik dengan faktur pajak

### 2. Backend Security Measures

#### backend/invoice-endpoints.js - `/api/invoice/upload-document`

**Security Check 1: File Size Validation**
- Max 10MB per file (enforced by multer config)
- Validate ulang di endpoint untuk safety
- Response: 413 Payload Too Large jika melebihi

```javascript
if (req.file.size > 10 * 1024 * 1024) {
    return res.status(413).json({
        error: 'File terlalu besar',
        message: 'Maksimal ukuran file: 10MB',
        received: `${(req.file.size / 1024 / 1024).toFixed(2)}MB`
    });
}
```

**Security Check 2: MIME Type Validation**
- Whitelist allowed file types:
  - `application/pdf`
  - `image/jpeg`
  - `image/png`
  - `image/jpg`
- Reject semua file type lainnya
- Response: 400 Bad Request dengan detail

```javascript
const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
if (!allowedMimeTypes.includes(req.file.mimetype)) {
    return res.status(400).json({
        error: 'Tipe file tidak diizinkan',
        message: 'Hanya PDF, JPG, JPEG, PNG yang diterima',
        received: req.file.mimetype
    });
}
```

**Enhanced Logging**
- Log setiap upload attempt dengan:
  - User ID
  - File size
  - File type
  - MIME type validation status

### 3. Concurrent Upload Handling

Frontend sudah handle concurrent uploads dengan:
- Sequential upload loop (tidak parallel)
- Progress tracker per file
- Individual error handling per file
- Graceful failure untuk satu file tidak affect lainnya

```javascript
for (let i = 0; i < validFiles.length; i++) {
    const file = validFiles[i];
    document.getElementById('uploadProgress').textContent = `${i + 1}/${validFiles.length} files`;
    // Sequential upload per file
}
```

## Security Considerations

### ✅ Implemented
1. **File Size Limit**: 10MB per file (frontend + backend validation)
2. **MIME Type Validation**: Whitelist approach (PDF, JPG, PNG)
3. **File Count Limit**: Max 50 files per batch (frontend)
4. **Filename Validation**: Extract & verify faktur number
5. **Duplicate Detection**: Check existing files before upload
6. **Authentication**: All endpoints require super_admin or moderator role
7. **Logging**: Comprehensive audit trail

### ⏸️ Deferred (untuk nanti saat migration selesai)
- Rate Limiting: 50 files per user per jam - **DISABLED** untuk saat ini karena masih perlu migrate semua file ke sistem

### 🔄 Sequential Processing
- Tidak ada concurrent requests ke backend
- Backend processes 1 file at a time
- Reduces server load
- Better error handling

### 📊 Upload Metrics
- Total payload per batch: 50 files × 10MB = 500MB (worst case)
- Typical payload: 50 files × 2-3MB ≈ 100-150MB
- Processing time: ~1-2 seconds per file = 50-100 seconds total
- Memory usage: In-memory buffering during upload

## Production Recommendations

### 1. Implement Redis Rate Limiter
Current: In-memory tracker (lost on server restart)
```javascript
// Replace global.uploadLimitTracker with Redis
// npm install redis
```

### 2. Implement Disk Space Monitoring
```javascript
// Add check for available disk space before upload
// Prevent "disk full" errors during upload
```

### 3. Add Upload Resumption
```javascript
// For large file batches, support resumable uploads
// Use resumable upload library (tus.io, resumablejs)
```

### 4. Implement Virus Scanning
```javascript
// Add ClamAV or similar for malware detection
// Scan file after upload, before storage
```

### 5. Add API Rate Limiting Headers
```javascript
res.setHeader('X-RateLimit-Limit', '50');
res.setHeader('X-RateLimit-Remaining', remaining);
res.setHeader('X-RateLimit-Reset', resetTime);
```

## Testing

### Test Cases

**Valid Upload**
- Upload 50 PDF files, 2MB each
- Expected: All 50 files upload successfully

**Exceed Limit**
- Try upload 60 files
- Expected: First 50 uploaded, 10 rejected

**Invalid MIME Type**
- Upload .exe, .zip, .doc files
- Expected: Rejected with 400 error

**File Too Large**
- Upload 1 file > 10MB
- Expected: Rejected with 413 error

**Rate Limit**
- Upload 50 files
- Immediately try upload another file
- Expected: 429 error "Maksimal 50 file per jam"

## Rollback Plan

If issues occur:
1. Revert MAX_FILES from 50 to 25 in frontend
2. Disable rate limiting in backend temporarily
3. Monitor server resources
4. Implement incremental increase (25 → 30 → 40 → 50)

## Monitoring

Add monitoring untuk:
- Average upload file count
- Average file size
- Upload success rate
- Rate limit hits
- File type distribution
- Upload duration

```sql
-- Query untuk monitor uploads
SELECT 
    DATE(created_at) as date,
    COUNT(*) as upload_count,
    AVG(file_size) as avg_size,
    MAX(file_size) as max_size
FROM invoice_files
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## References
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [Multer Security](https://github.com/expressjs/multer#security)
- Rate Limiting Best Practices
