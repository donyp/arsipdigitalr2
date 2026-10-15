# Backup System Troubleshooting Guide

## Issue: "Database backup failed: UnknownError"

### Root Causes

1. **Backup tables don't exist in Supabase**
   - The `backup_history` and `backup_config` tables need to be created first
   - This is a one-time initialization step

2. **RLS policies blocking server-side access**
   - Previously the SQL schema had `auth.jwt()` policies that only work with client-side auth
   - These have been disabled; server-side backups use service role credentials

### Solution

#### Step 1: Verify Supabase Connection
Check your `.env` file has valid credentials:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

#### Step 2: Initialize Backup Tables (One-Time Setup)
Run this script once to create the required tables:
```bash
node backend/init-backup-tables.js
```

If the script says you need to run SQL manually, do this:
1. Go to https://app.supabase.com → Your Project
2. Click "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy the entire contents of `backend/CREATE_BACKUP_TABLES.sql`
5. Click "Run"

The SQL will create:
- `backup_history` table - stores backup metadata
- `backup_config` table - stores backup configuration
- Indexes for fast queries
- Default backup schedules

#### Step 3: Test Backup (Server Must Be Running)
```bash
# Start backend
npm start

# In another terminal, test manual backup
curl -X POST http://localhost:3000/api/backups/manual \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
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

### Verification Steps

1. **Check Backend Logs**
   - Look for: `[BackupManager] Backup tables verified ✅`
   - Or: `[BackupManager] ⚠️  backup_history table not found`

2. **Verify Tables in Supabase**
   - Go to Supabase Dashboard → Table Editor
   - Look for: `backup_history` and `backup_config`
   - Click each table to verify columns exist

3. **Check Backup Records**
   ```bash
   curl http://localhost:3000/api/backups/history \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

4. **Check R2 Storage**
   - Go to Cloudflare Dashboard → R2
   - Look for folder: `backups/database/`
   - Should see files like: `db-backup-2026-10-15T14-30-45-123Z.sql`

### Common Errors and Solutions

#### Error: `relation "backup_history" does not exist` (Code: 42P01)
**Cause**: Backup tables haven't been created
**Fix**: Run `node backend/init-backup-tables.js`

#### Error: `permission denied for schema public`
**Cause**: Service role key doesn't have proper permissions
**Fix**: Verify `SUPABASE_SERVICE_ROLE_KEY` in `.env` is correct (not anon key)

#### Error: `R2 upload failed: NoCredentials`
**Cause**: R2 credentials missing or invalid
**Fix**: Verify `.env` has valid R2 settings:
```
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token
CLOUDFLARE_R2_BUCKET_NAME=your-bucket-name
```

#### Error: `undefined is not a function` in backup-manager
**Cause**: BackupManager wasn't properly initialized
**Fix**: Ensure server.js line 1484 instantiates BackupManager before using it

### Database Schema Reference

#### backup_history table
```sql
- id (BIGINT) - Primary key
- type (VARCHAR) - 'database', 'files', 'config', 'all'
- name (VARCHAR) - Backup filename
- size (BIGINT) - File size in bytes
- path (VARCHAR) - R2 storage path
- status (VARCHAR) - 'success' or 'failed'
- error_message (TEXT) - Error details if failed
- timestamp (TIMESTAMP) - When backup was created
- created_at (TIMESTAMP) - Database record creation time
- updated_at (TIMESTAMP) - Database record update time
```

#### backup_config table
```sql
- id (BIGINT) - Primary key
- backup_type (VARCHAR) - Type of backup
- enabled (BOOLEAN) - Is this backup type enabled?
- schedule_cron (VARCHAR) - Cron schedule (e.g., "0 0 * * *")
- retention_days (INTEGER) - How many days to keep backups
- last_run (TIMESTAMP) - When this backup last ran
- next_run (TIMESTAMP) - When this backup will run next
- is_active (BOOLEAN) - Is schedule active?
- created_at (TIMESTAMP) - Record creation time
- updated_at (TIMESTAMP) - Record update time
```

### API Endpoints

#### Manual Backup
```
POST /api/backups/manual
Body: {"type":"database|files|config|all"}
Response: { success: true, results: {...} }
```

#### Backup History
```
GET /api/backups/history?type=database&limit=50
Response: { success: true, data: [...] }
```

#### Backup Statistics
```
GET /api/backups/stats
Response: { success: true, data: { total, byType, byStatus, lastBackups } }
```

#### Download Backup
```
GET /api/backups/download/:backupName?type=database
Response: Binary file
```

#### Delete Backup
```
DELETE /api/backups/:backupName?type=database
Response: { success: true, message: "Backup deleted successfully" }
```

### Scheduled Backups (Cron)

Default schedules (in server.js):
- **Database**: Daily at 00:00 UTC
- **Files**: Weekly (Sunday) at 02:00 UTC
- **Config**: Daily at 01:00 UTC

To enable:
1. Uncomment in server.js:
   ```javascript
   // backupManager.startScheduledBackups();
   ```
   Change to:
   ```javascript
   backupManager.startScheduledBackups();
   ```
2. Restart server

### Performance Notes

- Database backups can take 10-60 seconds depending on data size
- File backups are faster (depends on ZIP compression)
- Config backups are almost instant
- All backups are asynchronous and don't block API requests
- R2 uploads are non-fatal - backups complete even if R2 fails

### Debugging

Enable verbose logging:
1. Set in `.env`: `DEBUG=true` or `NODE_ENV=development`
2. Check `backend/server.js` for `[BackupManager]` logs
3. Look for: `Recording backup:` logs to see what's being inserted
4. Check R2 console for upload success/failure

### Still Having Issues?

If backups still fail after these steps:
1. Check backend console for full error messages
2. Verify table columns match the schema in `CREATE_BACKUP_TABLES.sql`
3. Test Supabase connection directly: `SELECT NOW();` in SQL Editor
4. Verify R2 credentials work: try uploading a test file via Cloudflare dashboard
5. Check service role key has `postgres` role (not limited scope)
