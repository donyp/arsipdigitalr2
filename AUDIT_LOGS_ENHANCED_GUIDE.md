# Audit Logs - Enhanced Documentation

## 🎯 Tujuan
Mencatat semua aktivitas penting dengan detail kontekstual, severity level, dan pattern detection untuk compliance dan monitoring.

---

## 📊 Resource Types & Operations

### 1. **INVOICE** (Faktur / Invoice)
Melacak semua transaksi dokumen faktur.

| Operation | Deskripsi | Severity | Detail Tracked |
|-----------|-----------|----------|-----------------|
| **CREATE** | Invoice baru dibuat | info | nomor_invoice, jumlah, toko_id, kategori |
| **UPDATE** | Invoice diubah | warning | field_yang_diubah, nilai_lama, nilai_baru |
| **DELETE** | Invoice dihapus | critical | nomor_invoice, jumlah, alasan |
| **DOWNLOAD** | Invoice diunduh | info | nomor_invoice, file_format, ukuran |
| **SEND** | Invoice dikirim | info | nomor_invoice, penerima_email, metode |
| **APPROVE** | Invoice disetujui | info | nomor_invoice, peninjau, catatan |
| **REJECT** | Invoice ditolak | warning | nomor_invoice, alasan_penolakan |
| **BULK_DELETE** | Hapus massal | critical | jumlah_invoice, filter_kriteria, alasan |

**Contoh Log:**
```json
{
  "action": "Invoice baru dibuat - PPN-2026-10-001",
  "resource_type": "invoice",
  "resource_id": "inv_123",
  "operation": "CREATE",
  "new_values": {
    "nomor_invoice": "PPN-2026-10-001",
    "jumlah": 5000000,
    "toko_id": 12,
    "kategori": "PPN"
  },
  "severity": "info"
}
```

---

### 2. **FILE** (File Upload / Download)
Melacak upload, download, dan manajemen file.

| Operation | Deskripsi | Severity | Detail Tracked |
|-----------|-----------|----------|-----------------|
| **CREATE** | File diunggah | info | filename, ukuran, tipe_file, toko_id |
| **UPDATE** | File diperbarui | info | filename, metadata_changes |
| **DELETE** | File dihapus | warning | filename, ukuran, alasan_delete |
| **DOWNLOAD** | File diunduh | info | filename, ukuran, download_count |
| **MOVE** | File dipindahkan | warning | filename, dari_toko, ke_toko |
| **RENAME** | File diubah nama | info | nama_lama, nama_baru |
| **RESTORE** | Dipulihkan dari sampah | info | filename, tanggal_dihapus |
| **BULK_DELETE** | Hapus massal | critical | jumlah_file, ukuran_total, alasan |
| **SYNC** | Sinkronisasi storage | info | jumlah_file, storage_type |

**Contoh Log:**
```json
{
  "action": "File baru diunggah - invoice_sept.pdf",
  "resource_type": "file",
  "resource_id": "file_456",
  "resource_name": "invoice_sept.pdf",
  "operation": "CREATE",
  "new_values": {
    "filename": "invoice_sept.pdf",
    "ukuran": 2500000,
    "tipe_file": "application/pdf",
    "toko_id": 12
  },
  "severity": "info"
}
```

---

### 3. **USER** (Pengguna / User Account)
Melacak aktivitas user, login, password, role changes.

| Operation | Deskripsi | Severity | Detail Tracked |
|-----------|-----------|----------|-----------------|
| **CREATE** | User baru dibuat | info | email, role, zona_id |
| **UPDATE** | Profil diubah | warning | field_yang_diubah |
| **DELETE** | User dihapus | critical | email, role, alasan |
| **LOGIN** | User login | info | email, metode_login, ip_address |
| **LOGOUT** | User logout | info | email, durasi_session |
| **PASSWORD_CHANGE** | Password diubah | warning | email, diminta_oleh |
| **ROLE_CHANGE** | Role berubah | critical | email, role_lama, role_baru |
| **UNLOCK** | User dibuka kunci | info | email, alasan |
| **LOCK** | User dikunci | warning | email, alasan_lock |

**Contoh Log:**
```json
{
  "action": "User login - admin@zona1.com",
  "resource_type": "user",
  "resource_id": "user_789",
  "resource_name": "admin@zona1.com",
  "operation": "LOGIN",
  "new_values": {
    "email": "admin@zona1.com",
    "metode_login": "email_password"
  },
  "severity": "info",
  "ip_address": "192.168.1.100"
}
```

---

### 4. **ZONA** (Zona/Region Management)
Melacak manajemen zona.

| Operation | Deskripsi | Severity | Detail Tracked |
|-----------|-----------|----------|-----------------|
| **CREATE** | Zona baru dibuat | info | zona_nama, zona_deskripsi |
| **UPDATE** | Zona diperbarui | warning | field_yang_diubah |
| **DELETE** | Zona dihapus | critical | zona_nama, jumlah_toko |
| **ADMIN_ASSIGN** | Admin ditugaskan | info | zona_nama, admin_email |
| **ADMIN_REMOVE** | Admin dihapus | warning | zona_nama, admin_email |
| **SYNC** | Data disinkronkan | info | zona_nama, jumlah_record |

---

### 5. **TOKO** (Toko/Store)
Melacak manajemen toko.

| Operation | Deskripsi | Severity | Detail Tracked |
|-----------|-----------|----------|-----------------|
| **CREATE** | Toko baru ditambahkan | info | nama_toko, zona_id, alamat |
| **UPDATE** | Data toko diubah | info | field_yang_diubah |
| **DELETE** | Toko dihapus | warning | nama_toko, zona_id, jumlah_file |
| **MERGE** | Toko digabung (duplikat) | warning | toko_sumber, toko_tujuan, jumlah_file |
| **BULK_DELETE** | Hapus massal | critical | jumlah_toko, zona_id |

---

### 6. **TICKET** (Support Ticket)
Melacak support tickets.

| Operation | Deskripsi | Severity | Detail Tracked |
|-----------|-----------|----------|-----------------|
| **CREATE** | Ticket baru dibuat | info | ticket_id, kategori, prioritas |
| **UPDATE** | Ticket diperbarui | info | ticket_id, status_baru |
| **CLOSE** | Ticket ditutup | info | ticket_id, solusi_final |
| **ASSIGN** | Ticket ditugaskan | info | ticket_id, penanggungjawab |
| **REOPEN** | Dibuka kembali | warning | ticket_id, alasan_reopen |

---

### 7. **SYSTEM** (Sistem Config)
Melacak perubahan konfigurasi sistem.

| Operation | Deskripsi | Severity | Detail Tracked |
|-----------|-----------|----------|-----------------|
| **CONFIG_CHANGE** | Config diubah | critical | config_key, nilai_lama, nilai_baru |
| **BACKUP_CREATE** | Backup dibuat | info | backup_size, tipe_backup |
| **BACKUP_RESTORE** | Di-restore | critical | backup_tanggal, waktu_restore |
| **MAINTENANCE** | Mode maintenance | warning | alasan, durasi_perkiraan |
| **API_KEY_GENERATE** | API key dibuat | warning | service_name, scope |
| **API_KEY_REVOKE** | API key di-revoke | warning | service_name, alasan |

---

### 8. **REPORT** (Laporan)
Melacak pembuatan dan export laporan.

| Operation | Deskripsi | Severity | Detail Tracked |
|-----------|-----------|----------|-----------------|
| **CREATE** | Laporan dibuat | info | tipe_laporan, periode, jumlah_record |
| **EXPORT** | Diekspor | info | tipe_laporan, format_export, ukuran_file |
| **SCHEDULE** | Dijadwalkan | info | tipe_laporan, frekuensi, penerima |

---

## 🔴 Severity Levels

| Level | Warna | Penggunaan | Contoh |
|-------|-------|-----------|---------|
| **info** | 🟢 Hijau | Aktivitas normal | login, download, create |
| **warning** | 🟡 Kuning | Aktivitas perlu perhatian | update, password change, file delete |
| **critical** | 🔴 Merah | Aktivitas kritis | bulk delete, role change, config change |

---

## ⚠️ Suspicious Activity Detection

Sistem otomatis mendeteksi aktivitas mencurigakan:

1. **HTTP Errors** - Status code 4xx atau 5xx
2. **Bulk Operations** - BULK_DELETE operations
3. **High Volume** - Unggah/hapus banyak file dalam waktu singkat
4. **Role Changes** - Perubahan role user (otomatis critical)
5. **System Changes** - Perubahan config sistem

Ketika suspicious activity terdeteksi:
- Severity otomatis naik menjadi **critical**
- Flag `is_suspicious = true` dipasang
- Log dikirim ke moderator untuk review

---

## 📝 Contoh Implementasi

### Menggunakan Enhanced Audit Logger

```javascript
const EnhancedAuditLogger = require('./audit-logger-enhanced');
const auditLogger = new EnhancedAuditLogger(supabase);

// Saat user membuat invoice baru
await auditLogger.logWithContext({
    userId: req.user.userId,
    userEmail: req.user.email,
    userRole: req.user.role,
    zonaId: req.user.zona_id,
    resourceType: 'invoice',
    resourceId: invoice.id,
    resourceName: `Invoice ${invoice.nomor_invoice}`,
    operation: 'CREATE',
    context: {
        detail: `Invoice No. ${invoice.nomor_invoice} untuk toko ${invoice.toko_id}`,
        jumlah: invoice.jumlah
    },
    newValues: {
        nomor_invoice: invoice.nomor_invoice,
        jumlah: invoice.jumlah,
        toko_id: invoice.toko_id,
        kategori: invoice.kategori
    },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    requestPath: req.path,
    requestMethod: req.method,
    statusCode: 201
});

// Saat admin mengubah role user
await auditLogger.logWithContext({
    userId: req.user.userId,
    userEmail: req.user.email,
    userRole: req.user.role,
    zonaId: req.user.zona_id,
    resourceType: 'user',
    resourceId: targetUser.id,
    resourceName: targetUser.email,
    operation: 'ROLE_CHANGE',
    context: {
        detail: `Role changed from admin_zona to moderator`,
        reason: 'Performance review'
    },
    oldValues: {
        role: 'admin_zona'
    },
    newValues: {
        role: 'moderator'
    },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    requestPath: req.path,
    requestMethod: req.method,
    statusCode: 200
});

// Saat delete massal file
await auditLogger.logWithContext({
    userId: req.user.userId,
    userEmail: req.user.email,
    userRole: req.user.role,
    zonaId: req.user.zona_id,
    resourceType: 'file',
    resourceId: null,
    resourceName: `Bulk delete - ${fileIds.length} files`,
    operation: 'BULK_DELETE',
    context: {
        jumlah_file: fileIds.length,
        ukuran_total: totalSize,
        detail: `Files from toko ${tokoId}`
    },
    newValues: {
        jumlah_file: fileIds.length,
        ukuran_total: totalSize,
        toko_id: tokoId
    },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    requestPath: req.path,
    requestMethod: req.method,
    statusCode: 200
});
```

---

## 🔍 Query Audit Logs

### Semua invoices yang dibuat hari ini
```
GET /api/audit-logs?resourceType=invoice&operation=CREATE&startDate=2026-10-04&endDate=2026-10-04
```

### Semua suspicious activity
```
GET /api/audit-logs/suspicious?severity=critical
```

### User activity timeline
```
GET /api/audit-logs/user/{userId}
```

### Statistics
```
GET /api/audit-logs/stats?startDate=2026-10-01&endDate=2026-10-31
```

### Export ke CSV
```
GET /api/audit-logs/export/csv?resourceType=invoice&startDate=2026-10-01
```

---

## 📊 Dashboard Filters

Moderator bisa filter berdasarkan:
- **Resource Type**: invoice, file, user, zona, toko, ticket, system, report
- **Operation**: CREATE, UPDATE, DELETE, DOWNLOAD, dll sesuai type
- **Severity**: info, warning, critical
- **User**: pilih user tertentu
- **Date Range**: dari tanggal sampai tanggal
- **Suspicious Only**: hanya suspicious activity

---

## 🛡️ Security Features

1. **IP Address Tracking** - Catat IP untuk setiap aktivitas
2. **User Agent** - Track browser/device yang digunakan
3. **Immutable Logs** - Sekali dicatat, tidak bisa diubah
4. **RLS Protection** - Row Level Security untuk data privacy
5. **Suspicious Flagging** - Otomatis flag aktivitas mencurigakan
6. **Bulk Action Warnings** - Alert untuk operasi massal

---

## 📋 Best Practices

1. ✅ Selalu log resource_type dan operation dengan akurat
2. ✅ Gunakan context untuk detail tambahan yang bermakna
3. ✅ Sertakan old_values dan new_values untuk UPDATE operations
4. ✅ Catat IP address dan user agent untuk security tracking
5. ✅ Review suspicious logs secara berkala
6. ❌ Jangan log password atau sensitive data di new_values
7. ❌ Jangan simpan file path yang mengandung secrets

---

## 🔄 Migration dari Audit Logger Lama

Jika masih menggunakan audit-logger.js yang lama, gunakan terus sambil secara bertahap migrate ke EnhancedAuditLogger:

```javascript
// Import keduanya
const AuditLogger = require('./audit-logger');
const EnhancedAuditLogger = require('./audit-logger-enhanced');

const auditLogger = new AuditLogger(supabase);
const enhancedAuditLogger = new EnhancedAuditLogger(supabase);

// Update calls ke enhanced version
// Lama: await auditLogger.log({ ... });
// Baru: await enhancedAuditLogger.logWithContext({ ... });
```

---

## 📞 Support

Untuk pertanyaan atau masalah audit logs, lihat:
- AUDIT_LOGS_QUICK_START.md
- AUDIT_LOGGING_SETUP_GUIDE.md
- AUDIT_LOGS_FUNCTIONS.sql
