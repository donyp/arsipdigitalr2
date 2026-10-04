# Integrasi Audit Logging Enhanced ke Server.js

## 📋 Langkah-Langkah Integrasi

### STEP 1: Update Imports di server.js

Di bagian atas server.js (sekitar line 61), tambahkan:

```javascript
// TAMBAH SETELAH line: const AuditLogger = require('./audit-logger');
const EnhancedAuditLogger = require('./audit-logger-enhanced');
const createAuditMiddleware = require('./audit-middleware');
```

### STEP 2: Initialize Enhanced Audit Logger

Setelah line `const auditLogger = new AuditLogger(supabase);` (sekitar line 835), tambahkan:

```javascript
// Initialize Enhanced Audit Logger
const enhancedAuditLogger = new EnhancedAuditLogger(supabase);
const auditMiddleware = createAuditMiddleware(supabase);

console.log('[INIT] Enhanced Audit Logger initialized ✅');
```

### STEP 3: Aplikasikan ke Invoice Endpoints

Cari endpoint-endpoint invoice (CREATE, UPDATE, DELETE) dan update dengan enhanced logging:

#### POST /api/invoices (Create)

**SEBELUM:**
```javascript
app.post('/api/invoices', authenticateToken, authorizeRole('admin_zona', 'moderator', 'super_admin'), async (req, res) => {
    try {
        const { nomor_invoice, jumlah, toko_id, kategori } = req.body;
        // ... create logic ...
        res.status(201).json(invoice);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

**SESUDAH:**
```javascript
app.post('/api/invoices', 
    authenticateToken, 
    authorizeRole('admin_zona', 'moderator', 'super_admin'), 
    auditMiddleware.auditRoute('invoice', 'CREATE'),
    async (req, res) => {
        try {
            const { nomor_invoice, jumlah, toko_id, kategori } = req.body;
            
            // ... create logic ...
            const invoice = await supabase
                .from('invoices')
                .insert({
                    nomor_invoice,
                    jumlah,
                    toko_id,
                    kategori
                })
                .select('*')
                .single();

            // LOG AUDIT
            await auditMiddleware.logCreate(req, {
                id: invoice.id,
                name: `Invoice ${nomor_invoice}`,
                context: {
                    detail: `Invoice baru untuk toko: ${toko_id}`,
                    jumlah
                },
                values: {
                    nomor_invoice,
                    jumlah,
                    toko_id,
                    kategori
                }
            });

            res.status(201).json(invoice);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);
```

#### PUT /api/invoices/:id (Update)

**SESUDAH:**
```javascript
app.put('/api/invoices/:id', 
    authenticateToken, 
    authorizeRole('admin_zona', 'moderator', 'super_admin'), 
    auditMiddleware.auditRoute('invoice', 'UPDATE'),
    async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;

            // Get old values
            const { data: oldInvoice } = await supabase
                .from('invoices')
                .select('*')
                .eq('id', id)
                .single();

            // Update
            const { data: updatedInvoice } = await supabase
                .from('invoices')
                .update(updates)
                .eq('id', id)
                .select('*')
                .single();

            // LOG AUDIT
            await auditMiddleware.logUpdate(req, {
                id: updatedInvoice.id,
                name: `Invoice ${updatedInvoice.nomor_invoice}`,
                context: {
                    detail: `Update fields: ${Object.keys(updates).join(', ')}`
                },
                oldValues: oldInvoice,
                newValues: updatedInvoice
            });

            res.json(updatedInvoice);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);
```

#### DELETE /api/invoices/:id (Delete)

**SESUDAH:**
```javascript
app.delete('/api/invoices/:id', 
    authenticateToken, 
    authorizeRole('admin_zona', 'moderator', 'super_admin'), 
    auditMiddleware.auditRoute('invoice', 'DELETE'),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { reason } = req.body;

            // Get before delete
            const { data: invoice } = await supabase
                .from('invoices')
                .select('*')
                .eq('id', id)
                .single();

            // Delete
            await supabase
                .from('invoices')
                .delete()
                .eq('id', id);

            // LOG AUDIT
            await auditMiddleware.logDelete(req, {
                id: invoice.id,
                name: `Invoice ${invoice.nomor_invoice}`,
                context: {
                    detail: `Invoice dihapus dari sistem`,
                    reason: reason || 'Tidak ada alasan',
                    jumlah: invoice.jumlah
                },
                values: invoice
            });

            res.json({ message: 'Invoice deleted' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);
```

---

### STEP 4: Aplikasikan ke File Endpoints

#### POST /api/files/upload (Upload)

```javascript
app.post('/api/files/upload', 
    authenticateToken, 
    requireUploadPermission,
    auditMiddleware.auditRoute('file', 'CREATE'),
    async (req, res) => {
        try {
            // ... upload logic ...
            const file = await supabase
                .from('files')
                .insert({
                    filename,
                    size,
                    mime_type: mimeType,
                    toko_id: tokoId
                })
                .select('*')
                .single();

            // LOG AUDIT
            await auditMiddleware.logCreate(req, {
                id: file.id,
                name: filename,
                context: {
                    detail: `File diunggah ke toko: ${tokoId}`
                },
                values: {
                    filename,
                    ukuran: size,
                    tipe_file: mimeType,
                    toko_id: tokoId
                }
            });

            res.status(201).json(file);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);
```

#### DELETE /api/files/:id (Delete Single)

```javascript
app.delete('/api/files/:id', 
    authenticateToken, 
    authorizeRole('admin_zona', 'moderator', 'super_admin'),
    auditMiddleware.auditRoute('file', 'DELETE'),
    async (req, res) => {
        try {
            const { id } = req.params;

            // Get file before delete
            const { data: file } = await supabase
                .from('files')
                .select('*')
                .eq('id', id)
                .single();

            // Delete
            await supabase
                .from('files')
                .delete()
                .eq('id', id);

            // LOG AUDIT
            await auditMiddleware.logDelete(req, {
                id: file.id,
                name: file.filename,
                context: {
                    detail: `File dihapus dari sistem`,
                    ukuran: file.size
                },
                values: file
            });

            res.json({ message: 'File deleted' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);
```

#### POST /api/files/bulk-delete (Bulk Delete)

```javascript
app.post('/api/files/bulk-delete', 
    authenticateToken, 
    authorizeRole('moderator', 'super_admin'),
    auditMiddleware.auditRoute('file', 'BULK_DELETE'),
    async (req, res) => {
        try {
            const { fileIds } = req.body;

            // Get files before delete
            const { data: files } = await supabase
                .from('files')
                .select('*')
                .in('id', fileIds);

            // Delete
            await supabase
                .from('files')
                .delete()
                .in('id', fileIds);

            // Calculate total size
            const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

            // LOG AUDIT - BULK OPERATION
            await auditMiddleware.logBulkOperation(req, {
                operation: 'DELETE',
                count: fileIds.length,
                totalSize,
                detail: `${fileIds.length} file dihapus dari sistem`
            });

            res.json({ message: `${fileIds.length} files deleted` });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);
```

---

### STEP 5: Aplikasikan ke User/Auth Endpoints

#### POST /api/auth/login (Login)

```javascript
app.post('/api/auth/login', csrfProtection, async (req, res) => {
    try {
        const { email, password } = req.body;

        // Authenticate
        const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (authError) {
            // LOG FAILED LOGIN
            await auditMiddleware.logAuth(req, {
                email,
                operation: 'LOGIN',
                context: { detail: 'Login gagal - kredensial salah' },
                statusCode: 401,
                isSuspicious: true
            });

            throw authError;
        }

        // Get user profile
        const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

        // LOG SUCCESSFUL LOGIN
        await auditMiddleware.logAuth(req, {
            userId: user.id,
            email,
            operation: 'LOGIN',
            context: { metode_login: 'email_password' }
        });

        // ... return token ...
    } catch (error) {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});
```

---

### STEP 6: Aplikasikan ke Toko/Zona Endpoints

#### POST /api/tokos (Create Toko)

```javascript
app.post('/api/tokos', 
    authenticateToken, 
    authorizeRole('admin_zona', 'moderator', 'super_admin'),
    auditMiddleware.auditRoute('toko', 'CREATE'),
    async (req, res) => {
        try {
            const { nama, zona_id, alamat } = req.body;

            const { data: toko } = await supabase
                .from('toko')
                .insert({ nama, zona_id, alamat })
                .select('*')
                .single();

            // LOG AUDIT
            await auditMiddleware.logCreate(req, {
                id: toko.id,
                name: nama,
                context: { detail: `Toko baru untuk zona: ${zona_id}` },
                values: { nama, zona_id, alamat }
            });

            res.status(201).json(toko);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);
```

#### POST /api/tokos/merge (Merge Duplicate)

```javascript
app.post('/api/tokos/merge', 
    authenticateToken, 
    authorizeRole('moderator', 'super_admin'),
    auditMiddleware.auditRoute('toko', 'MERGE'),
    async (req, res) => {
        try {
            const { sourceToko, targetToko } = req.body;

            // Get both tokos
            const { data: source } = await supabase
                .from('toko').select('*').eq('id', sourceToko).single();
            const { data: target } = await supabase
                .from('toko').select('*').eq('id', targetToko).single();

            // Move files
            await supabase
                .from('files')
                .update({ toko_id: targetToko })
                .eq('toko_id', sourceToko);

            // Count moved files
            const { count: fileCount } = await supabase
                .from('files')
                .select('*', { count: 'exact' })
                .eq('toko_id', targetToko);

            // Delete source
            await supabase.from('toko').delete().eq('id', sourceToko);

            // LOG AUDIT - MERGE OPERATION
            await auditMiddleware.logUpdate(req, {
                id: targetToko,
                name: target.nama,
                context: {
                    detail: `Toko duplikat ${source.nama} digabung ke ${target.nama}`,
                    toko_sumber: sourceToko,
                    toko_tujuan: targetToko,
                    jumlah_file_dipindahkan: fileCount
                },
                oldValues: { toko_sumber: sourceToko },
                newValues: { toko_tujuan: targetToko }
            });

            res.json({ message: 'Tokos merged successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);
```

---

### STEP 7: System Actions

#### PUT /api/system/config (Update Config)

```javascript
app.put('/api/system/config', 
    authenticateToken, 
    authorizeRole('super_admin'),
    async (req, res) => {
        try {
            const { key, value } = req.body;

            // Get old config
            const { data: oldConfig } = await supabase
                .from('system_config')
                .select('*')
                .eq('key', key)
                .single();

            // Update config
            const { data: config } = await supabase
                .from('system_config')
                .update({ value })
                .eq('key', key)
                .select('*')
                .single();

            // LOG SYSTEM ACTION - CRITICAL
            await auditMiddleware.logSystem(req, {
                configKey: key,
                operation: 'CONFIG_CHANGE',
                context: { detail: `Konfigurasi ${key} diubah` },
                oldValues: { config_key: key, nilai_lama: oldConfig?.value },
                newValues: { config_key: key, nilai_baru: value }
            });

            res.json(config);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);
```

---

## 🔄 Migration Path

### Phase 1: Audit Logging untuk HIGH-IMPACT Operations (Mandatory)
- ✅ Invoice CREATE, UPDATE, DELETE
- ✅ File UPLOAD, DELETE
- ✅ Bulk DELETE (files, invoices)
- ✅ User ROLE_CHANGE
- ✅ System CONFIG_CHANGE
- ✅ User LOGIN/LOGOUT

### Phase 2: Audit Logging untuk NORMAL Operations (Recommended)
- Toko CREATE, UPDATE, DELETE
- Zone management
- Ticket operations
- Report generation
- User profile updates

### Phase 3: Audit Logging untuk LOW-IMPACT Operations (Optional)
- File DOWNLOAD (high volume, dapat di-sample)
- READ operations
- Search/filter operations

---

## ⚙️ Configuration

### Environment Variables (Optional)

Tambahkan ke .env jika ingin custom behavior:

```env
# Audit Logging Configuration
AUDIT_LOG_BULK_THRESHOLD=50          # Trigger suspicious flag jika bulk op > threshold
AUDIT_LOG_RETENTION_DAYS=90          # Hapus logs lebih lama dari ini
AUDIT_LOG_ENABLE_CONTEXT=true        # Enable rich context logging
```

---

## 🧪 Testing

### Test 1: Log Invoice Creation

```bash
curl -X POST http://localhost:3000/api/invoices \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nomor_invoice": "INV-2026-001",
    "jumlah": 5000000,
    "toko_id": 12,
    "kategori": "PPN"
  }'
```

Verifikasi di audit logs:
- ✅ resource_type = "invoice"
- ✅ operation = "CREATE"
- ✅ severity = "info"
- ✅ action contains resource name

### Test 2: Log Suspicious Bulk Delete

```bash
curl -X POST http://localhost:3000/api/files/bulk-delete \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileIds": [1,2,3,...100]
  }'
```

Verifikasi di audit logs:
- ✅ is_suspicious = true
- ✅ severity = "critical" (karena > 50 items)
- ✅ jumlah_file = 100

### Test 3: View Audit Logs

```bash
# Semua invoices dibuat hari ini
curl -X GET "http://localhost:3000/api/audit-logs?resourceType=invoice&operation=CREATE&startDate=2026-10-04" \
  -H "Authorization: Bearer TOKEN"

# Semua suspicious activities
curl -X GET "http://localhost:3000/api/audit-logs/suspicious" \
  -H "Authorization: Bearer TOKEN"

# Export CSV
curl -X GET "http://localhost:3000/api/audit-logs/export/csv" \
  -H "Authorization: Bearer TOKEN" \
  > audit-logs.csv
```

---

## 📚 Files Reference

- `audit-logger-enhanced.js` - Core logger dengan templates
- `audit-middleware.js` - Middleware helpers untuk integrasi
- `AUDIT_LOGGING_EXAMPLES.js` - Contoh implementasi lengkap
- `AUDIT_LOGS_ENHANCED_GUIDE.md` - Dokumentasi lengkap
- `audit-endpoints.js` - API endpoints untuk viewing logs (sudah ada)

---

## ✅ Checklist Implementasi

- [ ] Import enhanced logger dan middleware di server.js
- [ ] Initialize di boot sequence
- [ ] Update Invoice endpoints (POST, PUT, DELETE)
- [ ] Update File endpoints (UPLOAD, DELETE, BULK_DELETE)
- [ ] Update Auth endpoints (LOGIN, LOGOUT)
- [ ] Update User management endpoints (ROLE_CHANGE, etc)
- [ ] Update System config endpoints
- [ ] Update Toko endpoints
- [ ] Test setiap endpoint dengan curl
- [ ] View hasil di audit logs dashboard
- [ ] Review suspicious activities
- [ ] Deploy ke production

---

## 🆘 Troubleshooting

### Logs tidak muncul

1. Pastikan Enhanced Audit Logger sudah di-initialize
2. Check console untuk error messages
3. Verifikasi user.userId ada di JWT token
4. Pastikan Supabase connection OK

### Terlalu banyak logs (High Volume)

1. Disable audit untuk READ operations
2. Implement sampling untuk DOWNLOAD operations
3. Adjust AUDIT_LOG_BULK_THRESHOLD jika perlu
4. Setup log retention policy

### Performance Issues

1. Ensure proper indexes di audit_logs table (sudah ada)
2. Setup separate connection pool untuk audit writes
3. Consider async/queued audit logging
4. Monitor database slow queries

