/**
 * Fleet Management Endpoints
 * Handles vehicles, documents tracking, and maintenance history
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// Import supabase client dari server.js
let supabase;
let JWT_SECRET; // Will be set during initialization

// Initialize supabase dari server.js
function initializeSupabase(supabaseClient, jwtSecret) {
    supabase = supabaseClient;
    JWT_SECRET = jwtSecret;
}

// ============================================================
// MIDDLEWARE (Local definitions to avoid circular dependency)
// ============================================================

/**
 * Authentication Middleware
 * Verifies JWT token and loads user from database
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]);

    if (!token) {
        return res.status(401).json({ error: 'Token tidak ditemukan. Silakan login.' });
    }

    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Token tidak valid atau sudah expired.' });
        }
        
        try {
            // Query database for authoritative user role
            const { data: user, error } = await supabase
                .from('users')
                .select('id, email, role, zona_id, permissions, is_active')
                .eq('id', decoded.sub || decoded.userId)
                .single();
            
            if (error || !user) {
                return res.status(403).json({ error: 'Token tidak valid - user tidak ditemukan.' });
            }

            // Check if user is active
            if (user.is_active === false) {
                return res.status(403).json({ error: 'Akun Anda telah dinonaktifkan.' });
            }

            // Use DATABASE role (authoritative source)
            decoded.role = user.role;
            decoded.zona_id = user.zona_id;
            decoded.permissions = user.permissions || [];
            
            req.user = decoded;
            next();
        } catch (err) {
            return res.status(403).json({ error: 'Authentication verification failed.' });
        }
    });
}

/**
 * RBAC Middleware – restrict routes to specific roles
 */
function authorizeRole(...allowedRoles) {
    return (req, res, next) => {
        console.log('[RBAC] User role check:', {
            userRole: req.user?.role,
            allowedRoles,
            hasUser: !!req.user,
            isAllowed: allowedRoles.includes(req.user?.role)
        });
        
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                error: 'Anda tidak memiliki akses ke fitur ini.',
                debug: {
                    userRole: req.user?.role,
                    allowedRoles,
                    path: req.path
                }
            });
        }
        next();
    };
}

// ============================================================
// VEHICLES ENDPOINTS
// ============================================================

/**
 * GET /api/fleet/vehicles - List all vehicles
 */
router.get('/vehicles', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('vehicles')
            .select('*')
            .eq('is_active', true)
            .order('vehicle_type', { ascending: true })
            .order('plate_number', { ascending: true });

        if (error) throw error;

        res.json({
            success: true,
            data: data || [],
            count: data?.length || 0
        });
    } catch (error) {
        console.error('[Fleet] Error listing vehicles:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to list vehicles'
        });
    }
});

/**
 * GET /api/fleet/vehicles/:id - Get vehicle detail with documents and maintenance
 */
router.get('/vehicles/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Get vehicle details
        const { data: vehicle, error: vehicleError } = await supabase
            .from('vehicles')
            .select('*')
            .eq('id', id)
            .single();

        if (vehicleError || !vehicle) {
            return res.status(404).json({
                success: false,
                error: 'Vehicle not found'
            });
        }

        // Get documents for this vehicle
        const { data: documents, error: docsError } = await supabase
            .from('vehicle_documents')
            .select('*')
            .eq('vehicle_id', id)
            .order('expiration_date', { ascending: true });

        // Get maintenance history for this vehicle
        const { data: maintenance, error: mainError } = await supabase
            .from('vehicle_maintenance')
            .select('*')
            .eq('vehicle_id', id)
            .order('service_date', { ascending: false });

        if (docsError || mainError) throw docsError || mainError;

        // Calculate document status
        const docsWithStatus = calculateDocumentStatus(documents || []);

        res.json({
            success: true,
            data: {
                vehicle,
                documents: docsWithStatus,
                maintenance: maintenance || [],
                documentStats: calculateDocumentStats(documents || [])
            }
        });
    } catch (error) {
        console.error('[Fleet] Error getting vehicle details:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get vehicle details'
        });
    }
});

/**
 * POST /api/fleet/vehicles - Create new vehicle
 */
router.post('/vehicles', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const {
            plate_number,
            vehicle_type,
            vehicle_name,
            brand_model,
            year_manufacture,
            color,
            engine_number,
            chassis_number,
            vin,
            purchase_date,
            notes
        } = req.body;

        // Validasi input
        if (!plate_number || !vehicle_type || !vehicle_name) {
            return res.status(400).json({
                success: false,
                error: 'plate_number, vehicle_type, dan vehicle_name wajib diisi'
            });
        }

        const { data, error } = await supabase
            .from('vehicles')
            .insert([{
                plate_number,
                vehicle_type,
                vehicle_name,
                brand_model: brand_model || null,
                year_manufacture: year_manufacture || null,
                color: color || null,
                engine_number: engine_number || null,
                chassis_number: chassis_number || null,
                vin: vin || null,
                purchase_date: purchase_date || null,
                notes: notes || null,
                is_active: true,
                created_by: req.user.id,
                updated_by: req.user.id
            }])
            .select();

        if (error) throw error;

        res.status(201).json({
            success: true,
            data: data[0],
            message: `Kendaraan ${plate_number} berhasil ditambahkan`
        });
    } catch (error) {
        console.error('[Fleet] Error creating vehicle:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create vehicle'
        });
    }
});

/**
 * PUT /api/fleet/vehicles/:id - Update vehicle
 */
router.put('/vehicles/:id', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body, updated_by: req.user.id, updated_at: new Date() };
        
        // Jangan biarkan mengubah id atau created_at
        delete updates.id;
        delete updates.created_at;
        delete updates.created_by;

        const { data, error } = await supabase
            .from('vehicles')
            .update(updates)
            .eq('id', id)
            .select();

        if (error) throw error;

        res.json({
            success: true,
            data: data[0],
            message: 'Kendaraan berhasil diperbarui'
        });
    } catch (error) {
        console.error('[Fleet] Error updating vehicle:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to update vehicle'
        });
    }
});

// ============================================================
// VEHICLE DOCUMENTS ENDPOINTS
// ============================================================

/**
 * GET /api/fleet/documents/expiring - Get documents expiring within X days
 */
router.get('/documents/expiring', authenticateToken, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const daysNum = parseInt(days) || 30;

        const { data, error } = await supabase
            .from('vehicle_documents')
            .select('*, vehicles(plate_number, vehicle_name, vehicle_type)')
            .gte('expiration_date', new Date().toISOString().split('T')[0])
            .lte('expiration_date', new Date(Date.now() + daysNum * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
            .order('expiration_date', { ascending: true });

        if (error) throw error;

        // Calculate status on backend
        const docsWithStatus = (data || []).map(doc => {
            const daysUntil = Math.floor((new Date(doc.expiration_date) - new Date()) / (1000 * 60 * 60 * 24));
            return {
                ...doc,
                days_until_expiration: daysUntil,
                is_expired: new Date(doc.expiration_date) < new Date()
            };
        }).filter(doc => !doc.is_expired && doc.days_until_expiration > 0);

        res.json({
            success: true,
            data: docsWithStatus || [],
            count: docsWithStatus?.length || 0,
            warning: `${docsWithStatus?.length || 0} dokumen akan expired dalam ${daysNum} hari ke depan`
        });
    } catch (error) {
        console.error('[Fleet] Error getting expiring documents:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get expiring documents'
        });
    }
});

/**
 * GET /api/fleet/documents/expired - Get expired documents
 */
router.get('/documents/expired', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('vehicle_documents')
            .select('*, vehicles(plate_number, vehicle_name, vehicle_type)')
            .lt('expiration_date', new Date().toISOString().split('T')[0])
            .order('expiration_date', { ascending: true });

        if (error) throw error;

        // Calculate status on backend
        const expiredDocs = (data || []).map(doc => {
            const daysUntil = Math.floor((new Date(doc.expiration_date) - new Date()) / (1000 * 60 * 60 * 24));
            return {
                ...doc,
                days_until_expiration: daysUntil,
                is_expired: new Date(doc.expiration_date) < new Date()
            };
        }).filter(doc => doc.is_expired);

        res.json({
            success: true,
            data: expiredDocs || [],
            count: expiredDocs?.length || 0,
            warning: `⚠️ ${expiredDocs?.length || 0} dokumen sudah expired!`
        });
    } catch (error) {
        console.error('[Fleet] Error getting expired documents:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get expired documents'
        });
    }
});

/**
 * POST /api/fleet/documents - Add vehicle document
 */
router.post('/documents', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const {
            vehicle_id,
            plate_number,
            document_type,
            issue_date,
            expiration_date,
            document_number,
            issued_by,
            notes
        } = req.body;

        // Validasi input
        if (!vehicle_id || !document_type || !issue_date || !expiration_date) {
            return res.status(400).json({
                success: false,
                error: 'vehicle_id, document_type, issue_date, dan expiration_date wajib diisi'
            });
        }

        const { data, error } = await supabase
            .from('vehicle_documents')
            .insert([{
                vehicle_id,
                plate_number: plate_number || '',
                document_type,
                issue_date,
                expiration_date,
                document_number: document_number || null,
                issued_by: issued_by || null,
                notes: notes || null,
                renewal_status: 'PENDING',
                created_by: req.user.id,
                updated_by: req.user.id
            }])
            .select();

        if (error) throw error;

        res.status(201).json({
            success: true,
            data: data[0],
            message: `Dokumen ${document_type} berhasil ditambahkan`
        });
    } catch (error) {
        console.error('[Fleet] Error creating document:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create document'
        });
    }
});

/**
 * PUT /api/fleet/documents/:id - Update vehicle document
 */
router.put('/documents/:id', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body, updated_by: req.user.id, updated_at: new Date() };
        
        delete updates.id;
        delete updates.created_at;
        delete updates.created_by;

        const { data, error } = await supabase
            .from('vehicle_documents')
            .update(updates)
            .eq('id', id)
            .select();

        if (error) throw error;

        res.json({
            success: true,
            data: data[0],
            message: 'Dokumen berhasil diperbarui'
        });
    } catch (error) {
        console.error('[Fleet] Error updating document:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to update document'
        });
    }
});

/**
 * DELETE /api/fleet/documents/:id - Delete vehicle document
 */
router.delete('/documents/:id', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('vehicle_documents')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({
            success: true,
            message: 'Dokumen berhasil dihapus'
        });
    } catch (error) {
        console.error('[Fleet] Error deleting document:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to delete document'
        });
    }
});

// ============================================================
// VEHICLE MAINTENANCE ENDPOINTS
// ============================================================

/**
 * GET /api/fleet/maintenance/:vehicleId - Get maintenance history for vehicle
 */
router.get('/maintenance/:vehicleId', authenticateToken, async (req, res) => {
    try {
        const { vehicleId } = req.params;

        const { data, error } = await supabase
            .from('vehicle_maintenance')
            .select('*')
            .eq('vehicle_id', vehicleId)
            .order('service_date', { ascending: false });

        if (error) throw error;

        res.json({
            success: true,
            data: data || [],
            count: data?.length || 0
        });
    } catch (error) {
        console.error('[Fleet] Error getting maintenance history:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get maintenance history'
        });
    }
});

/**
 * POST /api/fleet/maintenance - Add maintenance record
 */
router.post('/maintenance', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const {
            vehicle_id,
            plate_number,
            maintenance_type,
            service_date,
            description,
            cost,
            odometer_reading,
            maintenance_provider,
            next_service_date,
            parts_replaced,
            notes
        } = req.body;

        // Validasi input
        if (!vehicle_id || !maintenance_type || !service_date || !description) {
            return res.status(400).json({
                success: false,
                error: 'vehicle_id, maintenance_type, service_date, dan description wajib diisi'
            });
        }

        const { data, error } = await supabase
            .from('vehicle_maintenance')
            .insert([{
                vehicle_id,
                plate_number: plate_number || '',
                maintenance_type,
                service_date,
                description,
                cost: cost || null,
                odometer_reading: odometer_reading || null,
                maintenance_provider: maintenance_provider || null,
                next_service_date: next_service_date || null,
                parts_replaced: parts_replaced || null,
                notes: notes || null,
                created_by: req.user.id,
                updated_by: req.user.id
            }])
            .select();

        if (error) throw error;

        res.status(201).json({
            success: true,
            data: data[0],
            message: `Maintenance record berhasil ditambahkan`
        });
    } catch (error) {
        console.error('[Fleet] Error creating maintenance record:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create maintenance record'
        });
    }
});

/**
 * PUT /api/fleet/maintenance/:id - Update maintenance record
 */
router.put('/maintenance/:id', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body, updated_by: req.user.id, updated_at: new Date() };
        
        delete updates.id;
        delete updates.created_at;
        delete updates.created_by;

        const { data, error } = await supabase
            .from('vehicle_maintenance')
            .update(updates)
            .eq('id', id)
            .select();

        if (error) throw error;

        res.json({
            success: true,
            data: data[0],
            message: 'Maintenance record berhasil diperbarui'
        });
    } catch (error) {
        console.error('[Fleet] Error updating maintenance record:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to update maintenance record'
        });
    }
});

/**
 * DELETE /api/fleet/maintenance/:id - Delete maintenance record
 */
router.delete('/maintenance/:id', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('vehicle_maintenance')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({
            success: true,
            message: 'Maintenance record berhasil dihapus'
        });
    } catch (error) {
        console.error('[Fleet] Error deleting maintenance record:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to delete maintenance record'
        });
    }
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function calculateDocumentStatus(documents) {
    return (documents || []).map(doc => {
        const daysUntil = Math.floor((new Date(doc.expiration_date) - new Date()) / (1000 * 60 * 60 * 24));
        return {
            ...doc,
            days_until_expiration: daysUntil,
            is_expired: daysUntil < 0
        };
    });
}

function calculateDocumentStats(documents) {
    const docsWithStatus = calculateDocumentStatus(documents);
    const stats = {
        total: docsWithStatus.length,
        expired: docsWithStatus.filter(d => d.is_expired).length,
        expiring_soon: docsWithStatus.filter(d => !d.is_expired && d.days_until_expiration <= 30 && d.days_until_expiration > 0).length,
        valid: docsWithStatus.filter(d => !d.is_expired && d.days_until_expiration > 30).length
    };
    return stats;
}

module.exports = {
    router,
    initializeSupabase
};
