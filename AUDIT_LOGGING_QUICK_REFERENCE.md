# Audit Logging - Quick Reference Card

## 🚀 Quick Start (Copy-Paste Templates)

### Template 1: Log Resource Creation

```javascript
// Di endpoint handler
await auditMiddleware.logCreate(req, {
    id: resource.id,
    name: `${resourceType} ${resource.nama}`,
    context: {
        detail: `${resourceType} baru dibuat`,
        // Add custom context here
    },
    values: {
        field1: resource.field1,
        field2: resource.field2
    }
});
```

### Template 2: Log Resource Update

```javascript
await auditMiddleware.logUpdate(req, {
    id: resource.id,
    name: `${resourceType} ${resource.nama}`,
    context: {
        detail: `Field yang diubah: ${Object.keys(updates).join(', ')}`
    },
    oldValues: oldResource,
    newValues: updatedResource
});
```

### Template 3: Log Resource Deletion

```javascript
await auditMiddleware.logDelete(req, {
    id: resource.id,
    name: resource.nama,
    context: {
        detail: `${resourceType} dihapus`,
        reason: req.body.reason || 'Tidak ada alasan'
    },
    values: deletedResource
});
```

### Template 4: Log Bulk Operation

```javascript
await auditMiddleware.logBulkOperation(req, {
    operation: 'DELETE', // atau CREATE, UPDATE
    count: itemIds.length,
    totalSize: totalBytes,
    detail: `${itemIds.length} items dihapus`
});
```

### Template 5: Log Download

```javascript
await auditMiddleware.logDownload(req, {
    id: file.id,
    name: file.filename,
    context: { detail: 'File diunduh' },
    filename: file.filename,
    size: file.size
});
```

---

## 📊 Resource Types & Default Operations

| Resource | Operations |
|----------|------------|
| **invoice** | CREATE, UPDATE, DELETE, DOWNLOAD, APPROVE, REJECT, SEND, BULK_DELETE |
| **file** | CREATE, UPDATE, DELETE, DOWNLOAD, MOVE, RENAME, RESTORE, BULK_DELETE, SYNC |
| **user** | CREATE, UPDATE, DELETE, LOGIN, LOGOUT, PASSWORD_CHANGE, ROLE_CHANGE, LOCK, UNLOCK |
| **zona** | CREATE, UPDATE, DELETE, ADMIN_ASSIGN, ADMIN_REMOVE, SYNC |
| **toko** | CREATE, UPDATE, DELETE, MERGE, BULK_DELETE |
| **ticket** | CREATE, UPDATE, CLOSE, ASSIGN, REOPEN |
| **system** | CONFIG_CHANGE, BACKUP_CREATE, BACKUP_RESTORE, MAINTENANCE, API_KEY_GENERATE, API_KEY_REVOKE |
| **report** | CREATE, EXPORT, SCHEDULE |

---

## 🎯 Severity Reference

| Severity | When to Use | Examples |
|----------|------------|----------|
| **info** 🟢 | Normal operations | CREATE, DOWNLOAD, LOGIN |
| **warning** 🟡 | Important changes | UPDATE, DELETE, PASSWORD_CHANGE |
| **critical** 🔴 | High-risk actions | ROLE_CHANGE, BULK_DELETE, CONFIG_CHANGE |

*Severity ditentukan otomatis berdasarkan resource_type + operation*

---

## 🔍 Common Patterns

### Trigger Suspicious Flag

```javascript
// Otomatis suspicious jika:
isSuspicious: true,  // Explicitly set
statusCode >= 400,   // HTTP error
operation === 'BULK_DELETE',  // Bulk ops
jumlah_file > 100,   // High volume
```

### Add Rich Context

```javascript
context: {
    detail: 'User ditambahkan ke zona 5',
    reason: 'New joining staff',
    duration_minutes: 120,
    affected_count: 5,
    source_file: 'monthly_batch.csv'
}
```

### Track Changes (Old vs New)

```javascript
oldValues: {
    status: 'pending',
    approval_count: 0
},
newValues: {
    status: 'approved',
    approval_count: 3
}
```

---

## 📋 Where to Add Audit Logging

| Endpoint | Priority | Resource Type |
|----------|----------|---------------|
| POST /api/invoices | ⭐⭐⭐ | invoice |
| PUT /api/invoices/:id | ⭐⭐⭐ | invoice |
| DELETE /api/invoices/:id | ⭐⭐⭐ | invoice |
| POST /api/files/upload | ⭐⭐⭐ | file |
| DELETE /api/files/:id | ⭐⭐⭐ | file |
| POST /api/files/bulk-delete | ⭐⭐⭐ | file |
| POST /api/auth/login | ⭐⭐⭐ | user |
| PUT /api/users/:id/role | ⭐⭐⭐ | user |
| POST /api/tokos | ⭐⭐ | toko |
| POST /api/tokos/merge | ⭐⭐ | toko |
| GET /api/invoices | ⭐ | invoice |
| GET /api/files | ⭐ | file |

---

## 🛑 What NOT to Log in new_values

```javascript
// ❌ DON'T - Password in plain text
newValues: {
    email: 'user@example.com',
    password: 'actualPassword123'  // ⚠️ NEVER
}

// ✅ DO - Just note password changed
newValues: {
    email: 'user@example.com',
    password_changed: true
}

// ❌ DON'T - Full paths with secrets
newValues: {
    s3_path: '/s3-bucket/secret-key/file.pdf'  // ⚠️ NEVER
}

// ✅ DO - Masked path
newValues: {
    s3_path: '/s3-bucket/.../file.pdf'
}
```

---

## 🧪 View Your Logs

### API Endpoints Available

```bash
# List logs with filters
GET /api/audit-logs?resourceType=invoice&operation=CREATE&limit=50

# Get suspicious only
GET /api/audit-logs/suspicious?severity=critical

# Get user's activity
GET /api/audit-logs/user/{userId}

# Statistics
GET /api/audit-logs/stats?startDate=2026-10-01&endDate=2026-10-31

# Export CSV
GET /api/audit-logs/export/csv?resourceType=invoice
```

### Query Params for Filtering

```
resourceType = invoice | file | user | zona | toko | ticket | system | report
operation = CREATE | UPDATE | DELETE | DOWNLOAD | etc (depends on type)
severity = info | warning | critical
isSuspicious = true | false
startDate = ISO 8601 date string
endDate = ISO 8601 date string
limit = 1-500 (default: 50)
offset = pagination offset
sortBy = created_at | severity | user_id | resource_type
sortOrder = asc | desc
```

---

## 💾 Database Schema (Reference)

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    user_id UUID,
    user_email VARCHAR(255),
    user_role VARCHAR(50),
    zona_id INTEGER,
    action VARCHAR(100),           -- Human readable description
    resource_type VARCHAR(50),     -- invoice, file, user, etc
    resource_id VARCHAR(255),      -- ID dari resource
    resource_name VARCHAR(255),    -- Name dari resource
    operation VARCHAR(20),         -- CREATE, UPDATE, DELETE, etc
    old_values JSONB,              -- Previous values (untuk UPDATE)
    new_values JSONB,              -- New values
    ip_address INET,               -- Client IP
    user_agent TEXT,               -- Browser/client info
    request_path VARCHAR(255),     -- API endpoint path
    request_method VARCHAR(10),    -- GET, POST, PUT, DELETE
    status_code INTEGER,           -- HTTP status
    response_message TEXT,         -- Success message
    error_message TEXT,            -- Error details jika ada
    created_at TIMESTAMP,          -- When this happened
    is_suspicious BOOLEAN,         -- Flagged as suspicious?
    severity VARCHAR(20)           -- info | warning | critical
);
```

---

## ⚡ Performance Tips

1. **Index frequently queried fields** (already done)
   - user_id, created_at, resource_type, operation, zona_id

2. **Async logging** if performance critical
   ```javascript
   // Fire and forget (don't await)
   auditMiddleware.logCreate(req, data).catch(console.error);
   ```

3. **Batch logs for exports** if many records
   ```javascript
   // Let audit-endpoints.js handle pagination
   GET /api/audit-logs/export/csv?limit=10000
   ```

4. **Archive old logs** (setup scheduled task)
   ```sql
   -- Run monthly to archive logs older than 90 days
   DELETE FROM audit_logs 
   WHERE created_at < NOW() - INTERVAL '90 days';
   ```

---

## 🚨 Common Mistakes

### ❌ Mistake 1: Forgetting to log
```javascript
// Missing audit log
const { data: file } = await deleteFileFromStorage(id);
res.json({ success: true });
```

### ✅ Fix 1: Always log
```javascript
const { data: file } = await deleteFileFromStorage(id);
await auditMiddleware.logDelete(req, {
    id: file.id,
    name: file.filename,
    context: { detail: 'File deleted' },
    values: file
});
res.json({ success: true });
```

### ❌ Mistake 2: Wrong context
```javascript
context: {
    // Vague, not helpful
    detail: 'Something changed'
}
```

### ✅ Fix 2: Rich context
```javascript
context: {
    detail: `Invoice status changed from draft to approved`,
    approver_id: approver.id,
    approval_timestamp: new Date().toISOString(),
    reason: 'Payment verified'
}
```

### ❌ Mistake 3: Logging sensitive data
```javascript
newValues: {
    api_key: 'sk_live_very_secret_key_123',  // ⚠️ NEVER!
    password_hash: 'bcrypt$2y$10$...'        // ⚠️ NO!
}
```

### ✅ Fix 3: Only log public/safe data
```javascript
newValues: {
    api_key_last_4: '3456',  // Only last 4 chars
    password_updated: true   // Flag, not actual value
}
```

---

## 📞 Quick Links

- **Full Guide**: AUDIT_LOGS_ENHANCED_GUIDE.md
- **Integration Steps**: INTEGRATION_AUDIT_LOGGING.md
- **Code Examples**: AUDIT_LOGGING_EXAMPLES.js
- **Setup Guide**: AUDIT_LOGGING_SETUP_GUIDE.md (existing)

---

## 🔗 Middleware Methods Quick Reference

```javascript
// Create operation
await auditMiddleware.logCreate(req, { id, name, context, values })

// Update operation
await auditMiddleware.logUpdate(req, { id, name, context, oldValues, newValues })

// Delete operation
await auditMiddleware.logDelete(req, { id, name, context, values })

// Download operation
await auditMiddleware.logDownload(req, { id, name, context, filename, size })

// Bulk operation (DELETE, CREATE)
await auditMiddleware.logBulkOperation(req, { operation, count, totalSize, detail })

// Auth operation (LOGIN, LOGOUT, PASSWORD_CHANGE)
await auditMiddleware.logAuth(req, { email, operation, context, statusCode, isSuspicious })

// System operation (CONFIG_CHANGE, BACKUP, etc)
await auditMiddleware.logSystem(req, { configKey, operation, context, oldValues, newValues })

// Direct logger access
const logger = auditMiddleware.getLogger()
await logger.logWithContext({ ...fullParams })
```

---

## 📈 Monitoring Checklist

- [ ] Review suspicious logs daily
- [ ] Check high-volume operations (bulk deletes)
- [ ] Monitor ROLE_CHANGE operations
- [ ] Track system CONFIG_CHANGE events
- [ ] Review failed LOGIN attempts
- [ ] Monitor anomalous download patterns
- [ ] Export monthly audit report
- [ ] Archive old logs (>90 days)

