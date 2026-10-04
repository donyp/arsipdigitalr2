/**
 * AUDIT_LOGGING_EXAMPLES.js
 * Contoh implementasi audit logging di berbagai endpoints
 * Copy-paste dan sesuaikan ke endpoint Anda
 */

const EnhancedAuditLogger = require('./audit-logger-enhanced');

/**
 * ============================================================
 * INVOICE ENDPOINTS
 * ============================================================
 */

// POST /api/invoices - Create invoice
async function handleCreateInvoice(req, res, supabase, auditLogger) {
    try {
        const { nomor_invoice, jumlah, toko_id, kategori } = req.body;

        // Create invoice
        const { data: invoice, error: createError } = await supabase
            .from('invoices')
            .insert({
                nomor_invoice,
                jumlah,
                toko_id,
                kategori
            })
            .select('*')
            .single();

        if (createError) throw createError;

        // Log audit
        const { ipAddress, userAgent } = EnhancedAuditLogger.extractClientInfo(req);
        const { userId, userEmail, userRole, zonaId } = EnhancedAuditLogger.extractUserInfo(req);

        await auditLogger.logWithContext({
            userId,
            userEmail,
            userRole,
            zonaId,
            resourceType: 'invoice',
            resourceId: invoice.id,
            resourceName: `Invoice ${nomor_invoice}`,
            operation: 'CREATE',
            context: {
                detail: `Invoice baru untuk toko: ${toko_id}`,
                jumlah
            },
            newValues: {
                nomor_invoice,
                jumlah,
                toko_id,
                kategori
            },
            ipAddress,
            userAgent,
            requestPath: req.path,
            requestMethod: req.method,
            statusCode: 201
        });

        res.status(201).json(invoice);
    } catch (error) {
        console.error('Error creating invoice:', error);
        res.status(500).json({ error: error.message });
    }
}

// PUT /api/invoices/:id - Update invoice
async function handleUpdateInvoice(req, res, supabase, auditLogger) {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Get old values
        const { data: oldInvoice } = await supabase
            .from('invoices')
            .select('*')
            .eq('id', id)
            .single();

        // Update invoice
        const { data: updatedInvoice, error: updateError } = await supabase
            .from('invoices')
            .update(updates)
            .eq('id', id)
            .select('*')
            .single();

        if (updateError) throw updateError;

        // Log audit
        const { ipAddress, userAgent } = EnhancedAuditLogger.extractClientInfo(req);
        const { userId, userEmail, userRole, zonaId } = EnhancedAuditLogger.extractUserInfo(req);

        await auditLogger.logWithContext({
            userId,
            userEmail,
            userRole,
            zonaId,
            resourceType: 'invoice',
            resourceId: id,
            resourceName: `Invoice ${updatedInvoice.nomor_invoice}`,
            operation: 'UPDATE',
            context: {
                detail: `Update fields: ${Object.keys(updates).join(', ')}`
            },
            oldValues: oldInvoice,
            newValues: updatedInvoice,
            ipAddress,
            userAgent,
            requestPath: req.path,
            requestMethod: req.method,
            statusCode: 200
        });

        res.json(updatedInvoice);
    } catch (error) {
        console.error('Error updating invoice:', error);
        res.status(500).json({ error: error.message });
    }
}

// DELETE /api/invoices/:id - Delete invoice
async function handleDeleteInvoice(req, res, supabase, auditLogger) {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        // Get invoice before delete
        const { data: invoice } = await supabase
            .from('invoices')
            .select('*')
            .eq('id', id)
            .single();

        // Delete invoice
        const { error: deleteError } = await supabase
            .from('invoices')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        // Log audit
        const { ipAddress, userAgent } = EnhancedAuditLogger.extractClientInfo(req);
        const { userId, userEmail, userRole, zonaId } = EnhancedAuditLogger.extractUserInfo(req);

        await auditLogger.logWithContext({
            userId,
            userEmail,
            userRole,
            zonaId,
            resourceType: 'invoice',
            resourceId: id,
            resourceName: `Invoice ${invoice.nomor_invoice}`,
            operation: 'DELETE',
            context: {
                detail: `Invoice dihapus dari sistem`,
                reason: reason || 'Tidak ada alasan',
                jumlah: invoice.jumlah
            },
            oldValues: invoice,
            ipAddress,
            userAgent,
            requestPath: req.path,
            requestMethod: req.method,
            statusCode: 200
        });

        res.json({ message: 'Invoice deleted' });
    } catch (error) {
        console.error('Error deleting invoice:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * ============================================================
 * FILE ENDPOINTS
 * ============================================================
 */

// POST /api/files/upload - Upload file
async function handleFileUpload(req, res, supabase, auditLogger) {
    try {
        const { filename, size, mimeType, tokoId } = req.body;

        // Store file
        const { data: file, error: uploadError } = await supabase
            .from('files')
            .insert({
                filename,
                size,
                mime_type: mimeType,
                toko_id: tokoId,
                uploaded_by: req.user.userId
            })
            .select('*')
            .single();

        if (uploadError) throw uploadError;

        // Log audit
        const { ipAddress, userAgent } = EnhancedAuditLogger.extractClientInfo(req);
        const { userId, userEmail, userRole, zonaId } = EnhancedAuditLogger.extractUserInfo(req);

        await auditLogger.logWithContext({
            userId,
            userEmail,
            userRole,
            zonaId,
            resourceType: 'file',
            resourceId: file.id,
            resourceName: filename,
            operation: 'CREATE',
            context: {
                detail: `File diunggah ke toko: ${tokoId}`
            },
            newValues: {
                filename,
                ukuran: size,
                tipe_file: mimeType,
                toko_id: tokoId
            },
            ipAddress,
            userAgent,
            requestPath: req.path,
            requestMethod: req.method,
            statusCode: 201
        });

        res.status(201).json(file);
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({ error: error.message });
    }
}

// DELETE /api/files/:id - Delete file
async function handleDeleteFile(req, res, supabase, auditLogger) {
    try {
        const { id } = req.params;

        // Get file before delete
        const { data: file } = await supabase
            .from('files')
            .select('*')
            .eq('id', id)
            .single();

        // Delete file
        const { error: deleteError } = await supabase
            .from('files')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        // Log audit
        const { ipAddress, userAgent } = EnhancedAuditLogger.extractClientInfo(req);
        const { userId, userEmail, userRole, zonaId } = EnhancedAuditLogger.extractUserInfo(req);

        await auditLogger.logWithContext({
            userId,
            userEmail,
            userRole,
            zonaId,
            resourceType: 'file',
            resourceId: id,
            resourceName: file.filename,
            operation: 'DELETE',
            context: {
                detail: `File dihapus dari sistem`,
                ukuran: file.size
            },
            oldValues: file,
            ipAddress,
            userAgent,
            requestPath: req.path,
            requestMethod: req.method,
            statusCode: 200
        });

        res.json({ message: 'File deleted' });
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({ error: error.message });
    }
}

// POST /api/files/bulk-delete - Bulk delete files
async function handleBulkDeleteFiles(req, res, supabase, auditLogger) {
    try {
        const { fileIds } = req.body;

        // Get files before delete
        const { data: files } = await supabase
            .from('files')
            .select('*')
            .in('id', fileIds);

        // Delete files
        const { error: deleteError } = await supabase
            .from('files')
            .delete()
            .in('id', fileIds);

        if (deleteError) throw deleteError;

        // Calculate total size
        const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

        // Log audit
        const { ipAddress, userAgent } = EnhancedAuditLogger.extractClientInfo(req);
        const { userId, userEmail, userRole, zonaId } = EnhancedAuditLogger.extractUserInfo(req);

        await auditLogger.logWithContext({
            userId,
            userEmail,
            userRole,
            zonaId,
            resourceType: 'file',
            resourceId: null,
            resourceName: `Bulk Delete - ${fileIds.length} files`,
            operation: 'BULK_DELETE',
            context: {
                jumlah_file: fileIds.length,
                ukuran_total: totalSize,
                detail: `${fileIds.length} file dihapus dari sistem`
            },
            newValues: {
                jumlah_file: fileIds.length,
                ukuran_total: totalSize
            },
            ipAddress,
            userAgent,
            requestPath: req.path,
            requestMethod: req.method,
            statusCode: 200,
            isSuspicious: fileIds.length > 50 // Flag if deleting > 50 files
        });

        res.json({ message: `${fileIds.length} files deleted` });
    } catch (error) {
        console.error('Error bulk deleting files:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * ============================================================
 * USER ENDPOINTS
 * ============================================================
 */

// POST /api/auth/login - User login
async function handleUserLogin(req, res, supabase, auditLogger) {
    try {
        const { email, password } = req.body;

        // Authenticate user
        const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (authError) throw authError;

        // Get user profile
        const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

        // Log audit
        const { ipAddress, userAgent } = EnhancedAuditLogger.extractClientInfo(req);

        await auditLogger.logWithContext({
            userId: user.id,
            userEmail: email,
            userRole: profile?.role,
            zonaId: profile?.zona_id,
            resourceType: 'user',
            resourceId: user.id,
            resourceName: email,
            operation: 'LOGIN',
            context: {
                metode_login: 'email_password'
            },
            newValues: {
                email,
                metode_login: 'email_password'
            },
            ipAddress,
            userAgent,
            requestPath: req.path,
            requestMethod: req.method,
            statusCode: 200
        });

        res.json({ user, token: 'jwt_token_here' });
    } catch (error) {
        console.error('Error during login:', error);

        // Log failed login attempt
        const { ipAddress, userAgent } = EnhancedAuditLogger.extractClientInfo(req);
        const auditLogger2 = new EnhancedAuditLogger(supabase);

        await auditLogger2.logWithContext({
            userId: null,
            userEmail: req.body.email,
            userRole: null,
            zonaId: null,
            resourceType: 'user',
            resourceId: null,
            resourceName: req.body.email,
            operation: 'LOGIN',
            context: {
                detail: 'Login gagal - kredensial salah'
            },
            ipAddress,
            userAgent,
            requestPath: req.path,
            requestMethod: req.method,
            statusCode: 401,
            isSuspicious: true
        });

        res.status(401).json({ error: 'Invalid credentials' });
    }
}

// PUT /api/users/:id/role - Change user role
async function handleChangeUserRole(req, res, supabase, auditLogger) {
    try {
        const { id } = req.params;
        const { newRole } = req.body;

        // Get old user
        const { data: oldUser } = await supabase
            .from('users')
            .select('*')
            .eq('id', id)
            .single();

        // Update role
        const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update({ role: newRole })
            .eq('id', id)
            .select('*')
            .single();

        if (updateError) throw updateError;

        // Log audit - CRITICAL ACTION
        const { ipAddress, userAgent } = EnhancedAuditLogger.extractClientInfo(req);
        const { userId, userEmail, userRole, zonaId } = EnhancedAuditLogger.extractUserInfo(req);

        await auditLogger.logWithContext({
            userId,
            userEmail,
            userRole,
            zonaId,
            resourceType: 'user',
            resourceId: id,
            resourceName: updatedUser.email,
            operation: 'ROLE_CHANGE',
            context: {
                detail: `Role berubah dari ${oldUser.role} ke ${newRole}`,
                reason: req.body.reason || 'Tidak ada alasan'
            },
            oldValues: {
                role: oldUser.role
            },
            newValues: {
                role: newRole
            },
            ipAddress,
            userAgent,
            requestPath: req.path,
            requestMethod: req.method,
            statusCode: 200
        });

        res.json(updatedUser);
    } catch (error) {
        console.error('Error changing user role:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * ============================================================
 * SYSTEM ENDPOINTS
 * ============================================================
 */

// PUT /api/system/config - Update system configuration
async function handleUpdateSystemConfig(req, res, supabase, auditLogger) {
    try {
        const { key, value } = req.body;

        // Get old config
        const { data: oldConfig } = await supabase
            .from('system_config')
            .select('*')
            .eq('key', key)
            .single();

        // Update config
        const { data: updatedConfig, error: updateError } = await supabase
            .from('system_config')
            .update({ value })
            .eq('key', key)
            .select('*')
            .single();

        if (updateError) throw updateError;

        // Log audit - CRITICAL ACTION
        const { ipAddress, userAgent } = EnhancedAuditLogger.extractClientInfo(req);
        const { userId, userEmail, userRole, zonaId } = EnhancedAuditLogger.extractUserInfo(req);

        await auditLogger.logWithContext({
            userId,
            userEmail,
            userRole,
            zonaId,
            resourceType: 'system',
            resourceId: key,
            resourceName: key,
            operation: 'CONFIG_CHANGE',
            context: {
                detail: `Konfigurasi ${key} diubah`,
                changed_by_role: userRole
            },
            oldValues: {
                config_key: key,
                nilai_lama: oldConfig?.value
            },
            newValues: {
                config_key: key,
                nilai_baru: value
            },
            ipAddress,
            userAgent,
            requestPath: req.path,
            requestMethod: req.method,
            statusCode: 200
        });

        res.json(updatedConfig);
    } catch (error) {
        console.error('Error updating config:', error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    handleCreateInvoice,
    handleUpdateInvoice,
    handleDeleteInvoice,
    handleFileUpload,
    handleDeleteFile,
    handleBulkDeleteFiles,
    handleUserLogin,
    handleChangeUserRole,
    handleUpdateSystemConfig
};
