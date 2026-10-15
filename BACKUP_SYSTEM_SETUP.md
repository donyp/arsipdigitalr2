# Backup System - Complete Setup Guide

## Issue
Getting "Database backup failed: UnknownError" when trying to backup.

## Root Cause
The backup tables in Supabase haven't been created yet. This is a **one-time setup** required before backups can work.

## ✅ Quick Setup (Choose One)

### Option 1: Automatic Setup (Recommended - Windows)
```bash
cd backend
setup-backup-tables.bat
```

### Option 2: Automatic Setup (Mac/Linux)
```bash
cd backend
chmod +x setup-backup-tables.sh
./setup-backup-tables.sh
```

### Option 3: Manual Node Script
```bash
cd backend
node init-backup-tables.js
```

### Option 4: Manual SQL (If scripts fail)
1. Open https://app.supabase.com → Your Project
2. Click **SQL Editor** in left sidebar
3. Click **New Query**
4. Copy entire contents of `backend/CREATE_BACKUP_TABLES.sql`
5. Click **Run**

## 📋 Verification Checklist

After running setup, verify it worked:

### Step 1: Check Tables in Supabase
- Open Supabase Dashboard
- Click **Table Editor**
- Look for:
  - ✓ `backup_history` table
  - ✓ `backup_config` table

### Step 2: Check Table Columns
Click `backup_history` and verify columns:
```
- id (BIGINT)
- type (VARCHAR)
- name (VARCHAR)
- size (BIGINT)
- path (VARCHAR)
- status (VARCHAR)
- error_message (TEXT)
- timestamp (TIMESTAMP)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### Step 3: Restart Backend Server
```bash
npm start
```

### Step 4: Test Backup
```bash
# Get your JWT token first from: localStorage.getItem('jwt_token')
# In admin dashboard, go to browser console and copy the token

curl -X POST http://localhost:3000/api/backups/manual \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -d '{"type":"database"}'
```

Expected response:
```json
{
  "success": true,
  "results": {
    "database": {
      "success": true,
      "backupName": "db-backup-2026-10-15T14-30-45-123Z.sql",
      "size": 5242880
    }
  }
}
```

### Step 5: Verify in Supabase
- Go to Supabase Dashboard → Table Editor → backup_history
- Should see a new row with:
  - type: "database"
  - status: "success"
  - name: "db-backup-2026-10-15..."

### Step 6: Verify in Cloudflare R2
- Open Cloudflare Dashboard → R2
- Check your bucket
- Navigate to `backups/database/`
- Should see: `db-backup-2026-10-15T14-30-45-123Z.sql`

## 🚀 Test All Backup Types

### Test Database Backup
```bash
curl -X POST http://localhost:3000/api/backups/manual \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"type":"database"}'
```

### Test File Backup
```bash
curl -X POST http://localhost:3000/api/backups/manual \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"type":"files"}'
```

### Test Config Backup
```bash
curl -X POST http://localhost:3000/api/backups/manual \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"type":"config"}'
```

### Test Combined Backup (All Types)
```bash
curl -X POST http://localhost:3000/api/backups/manual \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"type":"all"}'
```

## 📊 View Backup History

```bash
curl http://localhost:3000/api/backups/history \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "type": "database",
      "name": "db-backup-2026-10-15T14-30-45-123Z.sql",
      "size": 5242880,
      "status": "success",
      "timestamp": "2026-10-15T14:30:45.123Z"
    }
  ],
  "total": 1
}
```

## 📈 View Backup Statistics

```bash
curl http://localhost:3000/api/backups/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:
```json
{
  "success": true,
  "data": {
    "total": 3,
    "byType": {
      "database": 1,
      "files": 1,
      "config": 1
    },
    "byStatus": {
      "success": 3
    },
    "lastBackups": {
      "database": { "name": "...", "timestamp": "..." },
      "files": { "name": "...", "timestamp": "..." },
      "config": { "name": "...", "timestamp": "..." }
    }
  }
}
```

## 🔄 Enable Scheduled Backups

Scheduled backups run automatically at set times. To enable:

1. Open `backend/server.js`
2. Find line with: `// backupManager.startScheduledBackups();`
3. Uncomment it (remove the `//`)
4. Restart server

Schedule (UTC):
- **Database**: Daily at 00:00 (midnight)
- **Files**: Weekly on Sunday at 02:00 (2 AM)
- **Config**: Daily at 01:00 (1 AM)

## ⚠️ Troubleshooting

### Error: "relation backup_history does not exist"
- Run setup script or SQL again
- Verify tables created in Supabase

### Error: "permission denied"
- Check SUPABASE_SERVICE_ROLE_KEY in .env
- Should NOT be the anon key, must be service role key

### Backup uploads but doesn't appear in history
- Check table columns match CREATE_BACKUP_TABLES.sql
- Check PostgreSQL error logs in Supabase

### R2 upload fails
- Verify CLOUDFLARE_R2_BUCKET_NAME in .env
- Check CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN

## 📝 Environment Variables Required

Your `.env` file should have:

```
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# Cloudflare R2
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token
CLOUDFLARE_R2_BUCKET_NAME=your-bucket-name

# Other settings
NODE_ENV=production
PORT=3000
```

## 🎯 Common Tasks

### Download a Backup
```bash
curl -O http://localhost:3000/api/backups/download/db-backup-2026-10-15T14-30-45-123Z.sql?type=database \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Delete a Backup
```bash
curl -X DELETE http://localhost:3000/api/backups/db-backup-2026-10-15T14-30-45-123Z.sql?type=database \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Restore a Backup
```bash
curl -X POST http://localhost:3000/api/backups/restore \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "backupName": "db-backup-2026-10-15T14-30-45-123Z.sql",
    "type": "database"
  }'
```

## ✅ Success Indicators

You'll know setup is working when:

✓ Backup tables exist in Supabase  
✓ Manual backups succeed via API  
✓ Backup records appear in `backup_history` table  
✓ Files appear in `backups/*/` folders in R2  
✓ Admin dashboard shows backup history  
✓ No "UnknownError" messages  

## 📚 Related Files

- `backend/CREATE_BACKUP_TABLES.sql` - Table definitions
- `backend/backup-manager.js` - Backup logic
- `backend/backup-endpoints.js` - API routes
- `backend/init-backup-tables.js` - Setup script
- `BACKUP_SYSTEM_TROUBLESHOOTING.md` - Detailed troubleshooting

## 🆘 Still Having Issues?

If backups still don't work:

1. Check backend logs for `[BackupManager]` messages
2. Verify .env variables are correct
3. Ensure SUPABASE_SERVICE_ROLE_KEY (not anon key)
4. Manually run SQL from CREATE_BACKUP_TABLES.sql in Supabase
5. Restart backend after making changes
6. Check Supabase > SQL Editor for any errors

For detailed troubleshooting, see: `BACKUP_SYSTEM_TROUBLESHOOTING.md`
