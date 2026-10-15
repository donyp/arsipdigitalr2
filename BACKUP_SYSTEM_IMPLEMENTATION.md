# 🔒 Backup System Implementation Guide

## Overview

Sistem backup otomatis untuk Arsip Digital dengan 3 jenis backup:

1. **Database Backup** - Harian (00:00 UTC)
2. **File Backup** - Mingguan (Minggu 02:00 UTC)  
3. **Config/Metadata Backup** - Harian (01:00 UTC)

---

## 📋 File-File yang Ditambahkan

### Backend
- `backend/backup-manager.js` - Core backup logic
- `backend/backup-endpoints.js` - REST API endpoints
- `backend/CREATE_BACKUP_TABLES.sql` - Database schema

### Frontend (TODO)
- `admin-backup-dashboard.html` - Admin dashboard untuk manage backups
- `js/backup-admin.js` - JavaScript untuk backup management UI

---

## 🚀 Setup & Integrasi

### 1. Update Database Schema

Jalankan SQL script untuk membuat tabel-tabel backup:

```bash
# Login ke Supabase console dan jalankan:
# `backend/CREATE_BACKUP_TABLES.sql`
```

Atau via Node.js:

```javascript
const fs = require('fs');
const sql = fs.readFileSync('./backend/CREATE_BACKUP_TABLES.sql', 'utf-8');
await supabaseClient.rpc('exec_sql', { sql });
```

### 2. Install Dependencies

```bash
npm install cron archiver
```

### 3. Integrasi ke server.js

Tambahkan di `backend/server.js`:

```javascript
const BackupManager = require('./backup-manager');

// Setelah supabase dan r2 client initialized
const backupManager = new BackupManager(supabase, r2Storage);

// Start scheduled backups
backupManager.startScheduledBackups();

// Register backup routes
const backupRoutes = require('./backup-endpoints')(
    supabase,
    backupManager,
    authenticateToken,  // middleware
    authorizeRole       // middleware
);
app.use('/api', backupRoutes);
```

### 4. Update R2 Storage Config

Pastikan R2 bucket sudah setup untuk backups:

```javascript
// Di r2-storage.js atau sejenisnya
class R2Storage {
    async uploadFile(key, content, contentType) {
        // Upload ke bucket
    }
    
    async downloadFile(key) {
        // Download dari bucket
    }
    
    async deleteFile(key) {
        // Delete dari bucket
    }
    
    async listFiles(prefix) {
        // List files dengan prefix tertentu
    }
}
```

---

## 📊 Schedule Backup

### Database Backup
- **Waktu**: Setiap hari pukul 00:00 UTC
- **Cron**: `0 0 * * *`
- **Output**: `backups/database/db-backup-TIMESTAMP.sql`
- **Retention**: 30 hari

### File Backup
- **Waktu**: Setiap Minggu pukul 02:00 UTC
- **Cron**: `0 2 * * 0`
- **Output**: `backups/files/files-backup-TIMESTAMP.zip`
- **Retention**: 90 hari

### Config Backup
- **Waktu**: Setiap hari pukul 01:00 UTC
- **Cron**: `0 1 * * *`
- **Output**: `backups/config/config-backup-TIMESTAMP.json`
- **Retention**: 30 hari

---

## 🔌 API Endpoints

### Get Backup History
```bash
GET /api/backups/history?type=database&limit=50
Headers: Authorization: Bearer <token>
Response: { success, data: [], total }
```

### Get Backup Stats
```bash
GET /api/backups/stats
Headers: Authorization: Bearer <token>
Response: {
    success: true,
    data: {
        total: 150,
        byType: { database: 30, files: 4, config: 30 },
        byStatus: { success: 148, failed: 2 },
        lastBackups: { database: {...}, files: {...}, config: {...} }
    }
}
```

### Get Backup Config
```bash
GET /api/backups/config
Headers: Authorization: Bearer <token>
Response: { success, data: [...] }
```

### Trigger Manual Backup
```bash
POST /api/backups/manual
Headers: Authorization: Bearer <token>
Body: { "type": "database" }  // optional
Response: { success, results: {...} }
```

### Restore from Backup
```bash
POST /api/backups/restore
Headers: Authorization: Bearer <token>
Body: {
    "backupName": "db-backup-2024-01-15T00-00-00-000Z.sql",
    "type": "database"
}
Response: { success, message, result }
```

### Delete Backup
```bash
DELETE /api/backups/db-backup-2024-01-15T00-00-00-000Z.sql?type=database
Headers: Authorization: Bearer <token>
Response: { success, message }
```

### Download Backup
```bash
GET /api/backups/download/db-backup-2024-01-15T00-00-00-000Z.sql?type=database
Headers: Authorization: Bearer <token>
Response: File content
```

### Cleanup Old Backups
```bash
POST /api/backups/cleanup
Headers: Authorization: Bearer <token>
Response: { success, deleted: 5, message }
```

---

## 💾 Backup Data Structure

### Database Backup (.sql)
```sql
-- SQL dump dengan INSERT statements untuk semua tabel
INSERT INTO users (...) VALUES (...);
INSERT INTO invoices (...) VALUES (...);
...
```

### File Backup (.zip)
```
files-backup-TIMESTAMP.zip
├── invoices/bukti-bayar/...
├── invoices/faktur-pajak/...
├── invoices/pdf/...
└── ...
```

### Config Backup (.json)
```json
{
    "timestamp": "2024-01-15T01:00:00Z",
    "version": "1.0",
    "config": {
        "syncStatus": {...},
        "syncQueueCount": 42,
        "environment": "production",
        "recentLogs": [...]
    }
}
```

---

## 🛠 Monitoring & Maintenance

### Check Backup Status
```javascript
const history = await backupManager.getBackupHistory();
// Check jika ada failed backups
const failed = history.filter(b => b.status === 'failed');
```

### Manual Backup
```bash
curl -X POST http://localhost:5000/api/backups/manual \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"type": "database"}'
```

### Cleanup Old Backups
```bash
curl -X POST http://localhost:5000/api/backups/cleanup \
  -H "Authorization: Bearer <token>"
```

---

## ⚠️ Important Notes

1. **Backup Retention**
   - Database: 30 hari
   - Files: 90 hari  
   - Config: 30 hari
   - Cleanup otomatis via API atau cron job

2. **Storage Cost**
   - Monitor R2 usage untuk kontrolling costs
   - Database dumps: ~50MB/day
   - File backups: ~500MB-2GB/week (tergantung file size)

3. **Restore Testing**
   - Test restore procedure di non-production environment
   - Document restore steps untuk emergency situations

4. **Security**
   - Backups in R2 bucket harus ter-protect
   - Only super_admin dapat akses backup endpoints
   - Audit log semua backup operations

5. **Error Handling**
   - Failed backups di-log dan recorded di database
   - Setup monitoring/alerting untuk failed backups
   - Implement retry logic untuk failed backups

---

## 📝 Next Steps

1. ✅ Create backup tables in Supabase
2. ✅ Integrate BackupManager ke server.js
3. ✅ Setup R2 backup bucket
4. ⏳ Create admin dashboard untuk backup management
5. ⏳ Setup monitoring & alerting
6. ⏳ Document disaster recovery procedures
7. ⏳ Test restore procedures regularly

---

## 🆘 Troubleshooting

### Backup tidak jalan
- Check server logs untuk error messages
- Verify cron syntax di BackupManager
- Test manual backup via API

### Restore gagal
- Verify backup file integrity di R2
- Check database connection
- Review backup content format

### Storage penuh
- Review retention policies
- Delete old backups manually
- Upgrade R2 bucket capacity

---

## 📞 Support

Untuk issues atau questions, check:
- Server logs di `./data/log/`
- Backup history di `backup_history` table
- API response messages untuk error details
