# Cloudflare R2 - Quick Reference

Fast reference for developers working with the R2 storage backend.

## Quick Setup (5 minutes)

```bash
# 1. Set environment variables
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export CLOUDFLARE_ACCESS_KEY_ID="your-access-key"
export CLOUDFLARE_ACCESS_KEY_SECRET="your-secret-key"
export CLOUDFLARE_R2_BUCKET="arsip-anka"

# 2. Install & run
cd backend
npm install
npm start

# 3. Test
curl http://localhost:5000/api/heartbeat
```

## Storage Module API

### R2Storage Module (`backend/r2-storage.js`)

```javascript
const R2Storage = require('./r2-storage');

// Upload operations
await R2Storage.uploadInvoicePDF(buffer, filename, year, month, day, category, location);
await R2Storage.uploadDocumentFile(buffer, filename, year, month, day, folderType, location);
await R2Storage.uploadFile(buffer, remoteDestination, metadata);

// Download operations
const stream = await R2Storage.getStream(storagePath);
const buffer = await R2Storage.downloadFile(storagePath);

// File management
const exists = await R2Storage.checkFileExists(storagePath);
const existsFresh = await R2Storage.checkFileExistsNoCache(storagePath);
await R2Storage.deleteFile(storagePath);
const files = await R2Storage.listFiles(storagePath);

// Sync queue (for retry logic)
R2Storage.enqueueSyncJob({ storagePath, buffer, metadata });
await R2Storage.processPendingSyncJobs();
R2Storage.getSyncStatus(storagePath);
```

## Path Formats

```javascript
// Invoice PDFs
"ARSIPINVOICE/BEKASI/2026/02/10/PPN/invoice-001.pdf"
            ↓       ↓    ↓  ↓  ↓  ↓    ↓

// Documents
"ARSIPFILES/BEKASI/bukti-bayar/2026/02/10/bukti-001.pdf"
```

## Environment Variables

**Required:**
```bash
CLOUDFLARE_ACCOUNT_ID=xxx              # From Cloudflare dashboard
CLOUDFLARE_ACCESS_KEY_ID=xxx           # From API token
CLOUDFLARE_ACCESS_KEY_SECRET=xxx       # From API token (secret!)
CLOUDFLARE_R2_BUCKET=arsip-anka        # Your bucket name
```

**Optional:**
```bash
DOWNLOAD_CACHE_PATH=./backend/download-cache
SYNC_QUEUE_PATH=./data/storage-sync-queue.json
LOG_LEVEL=info
```

## Common Operations

### Upload a file
```javascript
// In route handler
const fileBuffer = req.file.buffer;
const result = await R2Storage.uploadInvoicePDF(
  fileBuffer,
  "invoice.pdf",
  2026,              // year
  2,                 // month
  10,                // day
  "PPN",             // category
  "BEKASI"           // location
);

console.log(result.storagePath);
// Output: ARSIPINVOICE/BEKASI/2026/02/10/PPN/invoice.pdf
```

### Download and stream
```javascript
// In route handler
const fileStream = await R2Storage.getStream(file.storage_path);
res.setHeader('Content-Type', 'application/pdf');
fileStream.pipe(res);
```

### Check if file exists (with cache)
```javascript
// Fast (5min cache)
const exists = await R2Storage.checkFileExists(storagePath);

// Fresh check (bypass cache)
const existsFresh = await R2Storage.checkFileExistsNoCache(storagePath);
```

### Delete file
```javascript
await R2Storage.deleteFile(storagePath);
// Automatically invalidates cache
```

## Troubleshooting

### "Missing required Cloudflare R2 configuration"
```bash
# Check all three are set
env | grep CLOUDFLARE_
# Output should show:
# CLOUDFLARE_ACCOUNT_ID=...
# CLOUDFLARE_ACCESS_KEY_ID=...
# CLOUDFLARE_ACCESS_KEY_SECRET=...
```

### "NotFound" errors
```bash
# Verify bucket exists and credentials are correct
aws s3 ls \
  --endpoint-url https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com \
  --access-key-id ${CLOUDFLARE_ACCESS_KEY_ID} \
  --secret-access-key ${CLOUDFLARE_ACCESS_KEY_SECRET}
```

### Files not showing up
1. Check bucket name matches `CLOUDFLARE_R2_BUCKET`
2. Verify API token has **Read & Write** permissions
3. Check CloudFlare dashboard directly

### Timeout during upload
- R2 operations have reasonable timeouts
- For files > 100MB, use chunked uploads
- Check network stability to R2 endpoint

## Performance Tips

1. **Use cache for repeated downloads**
   - First download: 1-2 seconds
   - Subsequent downloads: 100-500ms

2. **Batch operations**
   ```javascript
   // Good: parallel requests
   await Promise.all([
     R2Storage.checkFileExists(path1),
     R2Storage.checkFileExists(path2),
     R2Storage.checkFileExists(path3)
   ]);
   ```

3. **Avoid re-checking existence**
   - Cache results for 5 minutes
   - Use `checkFileExists()` not `checkFileExistsNoCache()`

## Cost Estimation

**R2 Pricing** (as of 2026):
- **Storage**: ~$0.015 per GB/month
- **API Calls**: $0.36 per million requests

**Example for 100GB storage:**
```
Monthly cost ≈ 100 GB × $0.015 = $1.50
Plus API calls (minimal for typical usage)
```

## What Happened to...?

| Old | Status | Alternative |
|-----|--------|-------------|
| rclone_wrapper.js | ❌ Deleted | r2-storage.js |
| gdrive-file-sync.js | ❌ Deleted | No longer needed (R2 is direct) |
| rateLimitProtection.js | ❌ Deleted | R2 has no rate limits |
| generate-rclone-config.js | ❌ Deleted | Use env vars instead |
| alistStartupHandler.js | ❌ Deleted | No longer needed |
| terabox handlers | ❌ Deleted | R2 is primary storage |

## Running Tests

```bash
# Run backend tests
cd backend
npm test

# Test file upload endpoint
curl -X POST http://localhost:5000/api/invoice/upload-pdf \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.pdf" \
  -F "faktur=TEST-001" \
  -F "zona_id=1"
```

## Docker Deployment

```bash
# Build image (rclone removed, curl kept)
docker build -t arsip-anka:latest backend/

# Run with R2 credentials
docker run -p 5000:8000 \
  -e CLOUDFLARE_ACCOUNT_ID=xxx \
  -e CLOUDFLARE_ACCESS_KEY_ID=xxx \
  -e CLOUDFLARE_ACCESS_KEY_SECRET=xxx \
  -e SUPABASE_URL=xxx \
  -e SUPABASE_SERVICE_ROLE_KEY=xxx \
  arsip-anka:latest
```

## For More Information

- **Full Setup**: See `R2_SETUP_GUIDE.md`
- **AWS SDK Docs**: https://docs.aws.amazon.com/sdk-for-javascript/
- **Cloudflare R2 Docs**: https://developers.cloudflare.com/r2/
- **S3 API Reference**: https://docs.aws.amazon.com/s3/latest/API/

## Related Files

- Storage module: `backend/r2-storage.js`
- Configuration: `backend/.env.example`
- Endpoints: `backend/invoice-endpoints.js`
- Server setup: `backend/server.js`
