# Cloudflare R2 Migration Guide

This document guides you through setting up and deploying the Pusat Arsip Anka backend with Cloudflare R2 storage.

## Overview

The backend has been completely migrated from rclone+Google Drive+Terabox to **Cloudflare R2** (S3-compatible object storage).

### What Changed
- **Old Storage**: rclone → Google Drive (primary) + Terabox (fallback) + Alist (WebDAV bridge)
- **New Storage**: Cloudflare R2 (S3-compatible API)
- **Removed Files**: 20+ files related to rclone, GDrive, Terabox, and Alist
- **New Module**: `backend/r2-storage.js` - complete R2 integration
- **Updated Dependencies**: Added AWS SDK for S3

### Files Removed
- `rclone_wrapper.js` - main rclone wrapper (replaced with r2-storage.js)
- `rclone.conf` - rclone configuration
- `generate-rclone-config.js` - rclone config generator
- `gdrive-file-sync.js` - Google Drive auto-sync
- `file-count-sync-job.js` - GDrive file counting
- `rcloneConnectivityHandler.js` - rclone connectivity checks
- `rateLimitProtection.js` - GDrive rate limiting
- `alistStartupHandler.js` - Alist initialization
- `teraboxStorageHandler.js`, `teraboxDirectAPI.js`, `teraboxHybridHandler.js` - Terabox handlers
- `teraboxCredentialManager.js` - Terabox credentials
- `local_storage.js` - local fallback storage
- `backendInitializer.js` - legacy initialization
- 8+ more rclone/terabox utilities

### Files Added
- `backend/r2-storage.js` - complete Cloudflare R2 integration

### Files Modified
- `backend/server.js` - removed rclone/gdrive imports and initialization
- `backend/invoice-endpoints.js` - R2Storage API calls
- `backend/.env.example` - R2 credentials instead of rclone/gdrive
- `backend/Dockerfile` - removed rclone installation
- `start.sh` - removed Alist/rclone initialization
- `.cloudbuild.yaml` - R2 secrets instead of Terabox
- `backend/package.json` - updated description, AWS SDK already included

---

## Prerequisites

1. **Cloudflare Account** with R2 enabled
2. **Node.js 20+** (for local development)
3. **Supabase Account** (for database)
4. **Git** (for version control)

---

## Step 1: Create Cloudflare R2 Bucket

### 1.1 Access Cloudflare Dashboard
1. Go to https://dash.cloudflare.com
2. Navigate to **R2** section (left sidebar)
3. Click **Create bucket**

### 1.2 Create Bucket
- **Bucket Name**: `arsip-anka` (or your preferred name)
- **Region**: Auto (recommended)
- **Settings**: Keep defaults
- Click **Create bucket**

### 1.3 Get Your Account ID
1. In R2 dashboard, look at the bottom-left corner
2. You'll see "Account ID" - click copy icon to copy it
3. Save this value - you'll need it: `CLOUDFLARE_ACCOUNT_ID`

---

## Step 2: Create API Token

### 2.1 Generate API Credentials
1. In R2 dashboard, click **Settings** (gear icon)
2. Scroll down to **API Tokens**
3. Click **Create API token**

### 2.2 Configure Token
- **Token Name**: `arsip-anka-api` (or any name)
- **Permissions**: Select **Bucket contents -> Read & Write** for your bucket
- **TTL**: Set to 1 year (or custom)
- Click **Create API Token**

### 2.3 Save Credentials
You'll see a one-time display:
```
Access Key ID: xxxxxxxxxxxxx
Secret Access Key: xxxxxxxxxxxxx
Endpoint: https://[account-id].r2.cloudflarestorage.com
```

**Save these three values immediately** (secret key won't be shown again):
- `CLOUDFLARE_ACCESS_KEY_ID` = Access Key ID
- `CLOUDFLARE_ACCESS_KEY_SECRET` = Secret Access Key  
- `CLOUDFLARE_ACCOUNT_ID` = (from Step 1.3)

---

## Step 3: Setup Environment Variables

### 3.1 Local Development

Create `backend/.env`:

```bash
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Authentication
JWT_SECRET=your-random-256-bit-hex-string
JWT_EXPIRES_IN=24h

# Application
PORT=5000
NODE_ENV=development

# Cloudflare R2 (CRITICAL)
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_ACCESS_KEY_ID=your-access-key-id
CLOUDFLARE_ACCESS_KEY_SECRET=your-secret-access-key
CLOUDFLARE_R2_BUCKET=arsip-anka

# Caching & Sync
DOWNLOAD_CACHE_PATH=./backend/download-cache
SYNC_QUEUE_PATH=./data/storage-sync-queue.json
SYNC_STATUS_PATH=./data/storage-sync-status.json

# Other
CORS_ORIGINS=http://localhost:3000,http://localhost:5000
AUTO_LOGOUT_TIME=00:00
```

### 3.2 Production Deployment (Cloud Run/Railway)

Set these environment variables in your deployment platform:

**Required Variables:**
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
JWT_SECRET
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_ACCESS_KEY_ID
CLOUDFLARE_ACCESS_KEY_SECRET
CLOUDFLARE_R2_BUCKET
```

**Optional Variables:**
```
NODE_ENV=production
PORT=8080
LOG_LEVEL=info
```

### 3.3 Validate Configuration

Before starting the application, verify all R2 credentials are set:

```bash
# Test script to validate
node -e "
const required = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_ACCESS_KEY_ID', 'CLOUDFLARE_ACCESS_KEY_SECRET'];
const missing = required.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error('❌ Missing required variables:', missing.join(', '));
  process.exit(1);
} else {
  console.log('✅ All R2 credentials configured');
}
"
```

---

## Step 4: Install Dependencies

```bash
cd backend
npm install

# This will install:
# - @aws-sdk/client-s3 ^3.500.0
# - @aws-sdk/s3-request-presigner ^3.500.0
# - (plus all existing dependencies)
```

---

## Step 5: Run Locally

### 5.1 Start the Backend

```bash
cd backend
npm start
```

Expected output:
```
[Startup] Validating Cloudflare R2 configuration...
[Startup] ✅ Cloudflare R2 configuration valid
✅ Backend listening on port 5000
🚀 Pusat Arsip Anka Backend v2.1 running on http://localhost:5000
   Auth: JWT (24h expiry)
   Storage: Cloudflare R2
   DB: Supabase PostgreSQL
```

### 5.2 Test File Upload

Use the invoice upload endpoint:

```bash
# Get an authentication token first
TOKEN=$(curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}' \
  | jq -r '.token')

# Upload a test file
curl -X POST http://localhost:5000/api/invoice/upload-pdf \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.pdf" \
  -F "faktur=INV-001" \
  -F "zona_id=1" \
  -F "toko_kode=BEKASI"

# Expected response:
# {
#   "success": true,
#   "message": "PDF berhasil diupload",
#   "storagePath": "ARSIPINVOICE/BEKASI/2026/02/10/PPN/test.pdf"
# }
```

### 5.3 Test File Download

```bash
# Download the file you just uploaded
curl -X GET "http://localhost:5000/api/invoice/download-file/INV-001/pdf" \
  -H "Authorization: Bearer $TOKEN" \
  -o downloaded.pdf
```

---

## Step 6: Deploy to Cloud Run

### 6.1 Setup Cloud Run

```bash
# Enable Cloud Run API
gcloud services enable run.googleapis.com

# Set project
gcloud config set project your-project-id
```

### 6.2 Create Cloud Build Trigger

The `.cloudbuild.yaml` file is already configured with R2 secrets. Update it:

```yaml
# In .cloudbuild.yaml, the deploy step uses R2 secrets:
--set-secrets=CLOUDFLARE_ACCOUNT_ID=arsip-cloudflare-account-id:latest
--set-secrets=CLOUDFLARE_ACCESS_KEY_ID=arsip-cloudflare-access-key-id:latest
--set-secrets=CLOUDFLARE_ACCESS_KEY_SECRET=arsip-cloudflare-access-key-secret:latest
```

### 6.3 Add Secrets to Cloud Build

```bash
# Create secret for Account ID
echo -n "your-account-id" | gcloud secrets create arsip-cloudflare-account-id --data-file=-

# Create secret for Access Key ID
echo -n "your-access-key-id" | gcloud secrets create arsip-cloudflare-access-key-id --data-file=-

# Create secret for Secret Key
echo -n "your-secret-access-key" | gcloud secrets create arsip-cloudflare-access-key-secret --data-file=-
```

### 6.4 Deploy

```bash
# Direct deployment
gcloud run deploy arsip-anka \
  --source . \
  --region asia-southeast1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --set-env-vars=NODE_ENV=production \
  --set-secrets=SUPABASE_URL=arsip-supabase-url:latest \
  --set-secrets=SUPABASE_SERVICE_ROLE_KEY=arsip-supabase-key:latest \
  --set-secrets=JWT_SECRET=arsip-jwt-secret:latest \
  --set-secrets=CLOUDFLARE_ACCOUNT_ID=arsip-cloudflare-account-id:latest \
  --set-secrets=CLOUDFLARE_ACCESS_KEY_ID=arsip-cloudflare-access-key-id:latest \
  --set-secrets=CLOUDFLARE_ACCESS_KEY_SECRET=arsip-cloudflare-access-key-secret:latest
```

---

## Step 7: Verify Deployment

### 7.1 Check Health Endpoint

```bash
curl https://your-cloud-run-url/api/heartbeat
# Expected: 200 OK
```

### 7.2 Check Storage Status

```bash
# Authenticate with the deployed service
TOKEN=$(curl -X POST https://your-cloud-run-url/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}' \
  | jq -r '.token')

# Check system health (includes storage)
curl -H "Authorization: Bearer $TOKEN" \
  https://your-cloud-run-url/api/system/health | jq .
```

Expected output should show:
```json
{
  "services": {
    "backend": { "healthy": true },
    "database": { "healthy": true },
    "storage": { "healthy": true, "type": "R2" }
  }
}
```

---

## Troubleshooting

### Error: "Missing required Cloudflare R2 configuration"

**Solution**: Ensure all three R2 credentials are set:
```bash
echo "CLOUDFLARE_ACCOUNT_ID=$CLOUDFLARE_ACCOUNT_ID"
echo "CLOUDFLARE_ACCESS_KEY_ID=$CLOUDFLARE_ACCESS_KEY_ID"
echo "CLOUDFLARE_ACCESS_KEY_SECRET=$CLOUDFLARE_ACCESS_KEY_SECRET"
```

All three must be non-empty strings.

### Error: "NotFound" when uploading files

**Solution**: Verify the R2 bucket exists and credentials have correct permissions:
1. Check bucket name matches `CLOUDFLARE_R2_BUCKET` env var
2. Verify API token has **Read & Write** permissions
3. Test credentials with AWS CLI:
   ```bash
   aws s3 ls \
     --endpoint-url https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com \
     --access-key-id ${CLOUDFLARE_ACCESS_KEY_ID} \
     --secret-access-key ${CLOUDFLARE_ACCESS_KEY_SECRET}
   ```

### Error: "Access Denied" during file operations

**Solution**: The API token permissions are too restrictive. Recreate with these permissions:
- **Bucket contents** → **Read & Write**
- **Bucket settings** → Leave unchecked (only for admin)

### Files not persisting after restart

**Solution**: This is expected. R2 Storage uses:
- **Downloads cache**: 24-hour TTL local cache for frequently downloaded files
- **Upload sync queue**: Retries failed uploads with exponential backoff

Both are temporary and can be safely cleared. Actual files are stored permanently in R2.

---

## R2 Storage Architecture

### File Path Structure

All files stored in R2 follow this structure:

**Invoice PDFs:**
```
ARSIPINVOICE/{location}/{year}/{month}/{day}/{category}/{filename}
Example: ARSIPINVOICE/BEKASI/2026/02/10/PPN/invoice-001.pdf
```

**Document Files:**
```
ARSIPFILES/{location}/{type}/{year}/{month}/{day}/{filename}
Example: ARSIPFILES/BEKASI/bukti-bayar/2026/02/10/bukti-001.pdf
```

### Caching System

1. **Download Cache** (24-hour TTL)
   - Location: `/app/backend/download-cache/`
   - Purpose: Cache frequently downloaded files locally
   - Auto-cleanup: Expires after 24 hours

2. **Sync Queue** (for failed uploads)
   - Location: `/app/data/storage-sync-queue.json`
   - Purpose: Retry failed uploads with exponential backoff
   - Behavior: Auto-retries every 30 seconds, max backoff 256s

3. **File Existence Cache** (5-minute TTL)
   - In-memory only
   - Purpose: Avoid redundant HEAD requests
   - Optimization: Request deduplication for parallel checks

### Performance Characteristics

- **Upload**: ~1-5 seconds for typical files (depends on file size)
- **Download (first)**: ~1-2 seconds (cold, from R2)
- **Download (cached)**: ~100-500ms (warm, from local cache)
- **Duplicate check**: ~50ms (cached) or ~1s (uncached)
- **Rate limits**: None - R2 has very generous rate limits

---

## API Endpoints

The following endpoints handle file operations:

### Upload Invoice PDF
```
POST /api/invoice/upload-pdf
Headers: Authorization: Bearer {token}
Body: multipart/form-data
  - file: PDF file
  - faktur: Invoice number
  - zona_id: Zone ID
  - toko_kode: Store code (optional)
```

### Upload Document File
```
POST /api/invoice/upload-document
Headers: Authorization: Bearer {token}
Body: multipart/form-data
  - file: Document file
  - faktur: Invoice number
  - doc_type: Document type (pdf, xlsx, etc)
```

### Download File
```
GET /api/invoice/download-file/:faktur/:fileType
Headers: Authorization: Bearer {token}
Response: File stream (PDF, Excel, etc)
```

### Delete File
```
DELETE /api/files/:id
Headers: Authorization: Bearer {token}
Body: JSON
  - storage_path: Path in R2
```

---

## Migration from Rclone+GDrive

### For Existing Data

**Important**: Existing files stored in rclone/GDrive are NOT automatically migrated to R2.

To migrate existing files:

1. **Export file list** from rclone/GDrive
2. **Download all files** to local machine
3. **Re-upload to R2** using the new API

```bash
# Example migration script (pseudo-code):
for file in $(existing-files); do
  download_from_gdrive $file
  upload_to_r2 $file
  update_database_path $file
done
```

### For New Files

All new files uploaded after deployment will automatically go to R2.

---

## Monitoring & Logs

### View Application Logs

**Local:**
```bash
# Logs print to console
npm start
```

**Cloud Run:**
```bash
gcloud run logs read arsip-anka --region asia-southeast1 --limit 50
```

### Check R2 Storage Usage

```bash
# Via AWS CLI
aws s3 ls \
  --endpoint-url https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com \
  --recursive s3://arsip-anka/ \
  --summarize
```

### Monitor Queue Status

```bash
# Check pending retries
cat /app/data/storage-sync-queue.json | jq 'length'
```

---

## Security Best Practices

1. **Rotate API Tokens Regularly**
   - Regenerate tokens every 3-6 months
   - Use separate tokens for dev/prod environments

2. **Restrict Token Permissions**
   - Only enable "Bucket contents - Read & Write"
   - Disable admin permissions

3. **Use Secrets Management**
   - Cloud Run Secrets (via gcloud)
   - Railway Secrets (via dashboard)
   - Never commit credentials to git

4. **Monitor Access Logs**
   - Enable R2 access logs if needed
   - Review for unusual access patterns

5. **Enable CORS if Needed**
   - Only allow specific origins
   - Don't use wildcard (`*`) in production

---

## Support

For issues:
1. Check `R2_SETUP_GUIDE.md` Troubleshooting section
2. Review application logs
3. Verify R2 bucket and credentials
4. Check network connectivity to R2 endpoint

---

## What's Different from Rclone

| Feature | Rclone+GDrive | R2 |
|---------|---------------|-----|
| **Storage Type** | Cloud storage (Google Drive) | S3-compatible object storage |
| **Configuration** | rclone.conf file | Environment variables |
| **Rate Limits** | Strict (1M units/min) | Generous (no practical limit) |
| **Availability** | Depends on GDrive API | Enterprise-grade (99.95% SLA) |
| **Cost** | Free (but limited) | Pay-per-use (~$0.015/GB stored) |
| **Setup Complexity** | Medium (rclone auth flow) | Simple (API token) |
| **Sync Required** | Yes (gdrive-file-sync.js) | No (direct S3 API) |
| **Performance** | Variable | Consistent & faster |

---

## Next Steps

1. ✅ Complete R2 setup (this guide)
2. ✅ Configure environment variables
3. ✅ Test locally
4. ✅ Deploy to production
5. 📋 Monitor R2 usage and costs
6. 📋 Schedule quarterly token rotation
7. 📋 Plan data migration from GDrive if needed
