// ============================================================
// Invoice System API Endpoints
// Handles Excel upload, invoice list, PDF upload, and matching
// ============================================================

// Check if required modules are available
let multer, uuid, parseExcel, validateData, upload;
const path = require('path');
const fs = require('fs');
const { updateFileCountDirectly, updateFilePath } = require('./direct-postgres-update');
const { logSecurityEvent, logWarning, logInfo, logDebug, isDebugMode } = require('./security-logging');
const { sanitizeString } = require('./input-validators');
const { ExcelUtils } = require('./excel-parser');
const { UploadQueue } = require('./upload-queue');
const {
    getTypeConfig,
    buildTargetPath,
    checkDuplicateState,
    persistInvoiceFile,
    syncInvoiceFileCount,
    isPdfBuffer
} = require('./invoice-upload-helper');
const {
    syncInvoiceFileStatus,
    deleteInvoiceFileRow,
    clearInvoiceFileRecord,
    computeFileStatus,
    normalizeKeterangan
} = require('./invoice-file-status');
const AuditLogger = require('./audit-logger');

try {
    multer = require('multer');
    uuid = require('uuid');
    const excelParser = require('./excel-parser');
    parseExcel = excelParser.parseExcel;
    validateData = excelParser.validateData;
    
    // Configure multer for file uploads - ONLY if multer loaded successfully
    const storage = multer.memoryStorage();
    upload = multer({
        storage: storage,
        limits: {
            fileSize: 10 * 1024 * 1024 // 10MB max
        },
        fileFilter: (req, file, cb) => {
            if (req.path.includes('upload-excel')) {
                // Excel files only
                const allowedExts = ['.xls', '.xlsx'];
                const ext = path.extname(file.originalname).toLowerCase();
                if (allowedExts.includes(ext)) {
                    cb(null, true);
                } else {
                    cb(new Error('Only Excel files (.xls, .xlsx) are allowed'));
                }
            } else if (req.path.includes('upload-pdf')) {
                // PDF files only
                if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
                    cb(null, true);
                } else {
                    cb(new Error('Only PDF files are allowed'));
                }
            } else {
                cb(null, true);
            }
        }
    });
} catch (err) {
    console.error('[Invoice Endpoints] ❌ Missing dependencies:', err.message);
    console.error('[Invoice Endpoints] Required: multer, uuid, xlsx');
    console.error('[Invoice Endpoints] Run: npm install multer uuid xlsx');
    multer = null;
    uuid = null;
    parseExcel = null;
    validateData = null;
    upload = null;
}

/**
 * Register all invoice endpoints
 */
/**
 * Scan R2 storage to count uploaded files for an invoice
 * Checks for invoice PDF, bukti bayar, and faktur pajak files
 * Returns just the count - does NOT save to database (schema cache broken)
 */
/**
 * Batch sync all invoice file counts from invoice_files table
 * This fixes the mismatch where invoices have PDFs but files_uploaded_count shows 0
 */
async function batchSyncAllFileCount(supabaseClient) {
    try {
        console.log('[BatchSync] Starting batch file count sync for ALL invoices...');
        
        // Get all invoices from invoice_file_list
        const { data: allInvoices, error: fetchErr } = await supabaseClient
            .from('invoice_file_list')
            .select('faktur, keterangan');
        
        if (fetchErr) {
            console.error('[BatchSync] Error fetching invoices:', fetchErr.message);
            return { success: false, error: fetchErr.message };
        }
        
        console.log(`[BatchSync] Found ${allInvoices?.length || 0} invoices to sync...`);
        
        let syncedCount = 0;
        let correctedCount = 0;
        let errorCount = 0;
        const batchSize = 50;
        
        // Process in batches to avoid overwhelming the database
        for (let i = 0; i < (allInvoices?.length || 0); i += batchSize) {
            const batch = allInvoices.slice(i, i + batchSize);
            
            // Process each invoice in parallel within batch
            const promises = batch.map(async (inv) => {
                try {
                    // Get file count from denormalized paths + invoice_files table
                    const { data: invData, error: dataErr } = await supabaseClient
                        .from('invoice_file_list')
                        .select('invoice_pdf_path, bukti_bayar_path, faktur_pajak_path, files_uploaded_count, keterangan')
                        .eq('faktur', inv.faktur)
                        .single();
                    
                    if (dataErr) return { faktur: inv.faktur, error: true };
                    
                    // Count files from denormalized paths
                    let filesUploaded = 0;
                    if (invData.invoice_pdf_path) filesUploaded++;
                    if (invData.bukti_bayar_path) filesUploaded++;
                    if (invData.faktur_pajak_path) filesUploaded++;
                    
                    // Also check invoice_files table
                    const { data: invoiceFiles, error: filesErr } = await supabaseClient
                        .from('invoice_files')
                        .select('file_type')
                        .eq('faktur', inv.faktur);
                    
                    const tableCount = invoiceFiles?.length || 0;
                    filesUploaded = Math.max(filesUploaded, tableCount);
                    
                    const isPPN = invData.keterangan?.toUpperCase() === 'PPN';
                    const requiredCount = isPPN ? 3 : 2;
                    const dbCount = invData.files_uploaded_count || 0;
                    
                    // Check if update is needed
                    if (dbCount !== filesUploaded) {
                        const { error: updateErr } = await supabaseClient
                            .from('invoice_file_list')
                            .update({ 
                                files_uploaded_count: filesUploaded,
                                files_required_count: requiredCount,
                                updated_at: new Date().toISOString()
                            })
                            .eq('faktur', inv.faktur);
                        
                        if (!updateErr) {
                            return { faktur: inv.faktur, corrected: true, old: dbCount, new: filesUploaded };
                        } else {
                            return { faktur: inv.faktur, error: true };
                        }
                    } else {
                        return { faktur: inv.faktur, corrected: false, count: filesUploaded };
                    }
                } catch (err) {
                    return { faktur: inv.faktur, error: true, message: err.message };
                }
            });
            
            const results = await Promise.all(promises);
            syncedCount += results.length;
            correctedCount += results.filter(r => r.corrected).length;
            errorCount += results.filter(r => r.error).length;
            
            // Log progress
            const correctedInBatch = results.filter(r => r.corrected).length;
            if (correctedInBatch > 0) {
                console.log(`[BatchSync] Batch ${Math.floor(i / batchSize) + 1}: Fixed ${correctedInBatch} invoices`);
            }
        }
        
        console.log(`[BatchSync] ✅ Sync complete: ${syncedCount} invoices processed, ${correctedCount} corrected, ${errorCount} errors`);
        
        return {
            success: true,
            synced: syncedCount,
            corrected: correctedCount,
            errors: errorCount,
            message: `Fixed ${correctedCount} invoices with file count mismatches`
        };
    } catch (err) {
        console.error('[BatchSync] Batch sync error:', err.message);
        return { success: false, error: err.message };
    }
}

async function updateFilesUploadedCount(supabaseClient, faktur, R2Storage) {
    try {
        console.log(`[UpdateCount] Checking files for faktur: ${faktur}...`);
        
        // Get invoice details from database
        const { data: invoice, error: invError } = await supabaseClient
            .from('invoice_file_list')
            .select('keterangan, tanggal, toko, faktur_pajak_path, invoice_pdf_path, bukti_bayar_path')
            .eq('faktur', faktur)
            .single();
        
        if (invError) {
            console.error(`[UpdateCount] Error fetching invoice:`, invError.message);
            return 0;
        }
        
        if (!invoice || !invoice.tanggal) {
            console.warn(`[UpdateCount] No invoice date found for faktur: ${faktur}`);
            return 0;
        }
        
        // OPTION 1: Check invoice_file_list table directly (fastest, uses denormalized paths)
        console.log(`[UpdateCount] Checking denormalized file paths in invoice_file_list...`);
        let filesUploaded = 0;
        if (invoice.invoice_pdf_path) filesUploaded++;
        if (invoice.bukti_bayar_path) filesUploaded++;
        if (invoice.faktur_pajak_path) filesUploaded++;
        
        if (filesUploaded > 0) {
            console.log(`[UpdateCount] ✅ Found ${filesUploaded} files from denormalized paths`);
            
            // OPTION 2: As fallback, also check invoice_files table for actual uploads
            const { data: invoiceFiles, error: filesErr } = await supabaseClient
                .from('invoice_files')
                .select('file_type')
                .eq('faktur', faktur);
            
            if (!filesErr && invoiceFiles && invoiceFiles.length > 0) {
                const actualCount = invoiceFiles.length;
                console.log(`[UpdateCount] Alternative source - invoice_files table has ${actualCount} files`);
                // Use the higher of the two counts (in case one source is out of sync)
                filesUploaded = Math.max(filesUploaded, actualCount);
            }
            
            // Save count to database
            try {
                const isPPN = invoice?.keterangan?.toUpperCase() === 'PPN';
                const requiredCount = isPPN ? 3 : 2;
                const { error: updateErr } = await supabaseClient
                    .from('invoice_file_list')
                    .update({ 
                        files_uploaded_count: filesUploaded,
                        files_required_count: requiredCount,
                        updated_at: new Date().toISOString()
                    })
                    .eq('faktur', faktur);
                
                if (updateErr) {
                    console.warn(`[UpdateCount] Warning: Could not save count to DB:`, updateErr.message);
                } else {
                    console.log(`[UpdateCount] ✅ Saved files_uploaded_count=${filesUploaded} to database for faktur ${faktur}`);
                }
            } catch (dbErr) {
                console.warn(`[UpdateCount] DB update attempt failed:`, dbErr.message);
            }
            
            return filesUploaded;
        }
        
        // Parse date from invoice (YYYY-MM-DD format)
        const year = invoice.tanggal.split('-')[0];
        const monthNum = String(invoice.tanggal.split('-')[1]).padStart(2, '0');
        const day = String(invoice.tanggal.split('-')[2]).padStart(2, '0');
        
        // Convert month number ke nama bulan.
        // Upload memakai konvensi Indonesia; file lama bisa memakai konvensi
        // Inggris -> coba keduanya agar file tidak terlewat.
        const monthVariants = R2Storage.monthNameVariants(monthNum);
        
        // Extract location from toko name
        const location = invoice.toko ? (invoice.toko.includes('PEMALANG') ? 'PEMALANG' : 'BEKASI') : 'BEKASI';
        
        const filename = `${faktur}.pdf`;
        let invoiceCount = 0, buktiCount = 0, fakturCount = 0;
        
        console.log(`[UpdateCount] Using date: ${year}/${monthVariants[0]}/${day}, location: ${location}`);
        
        // Check invoice PDF - try PPN dan NON paths untuk tanggal ini
        const invoicePaths = [];
        for (const monthName of monthVariants) {
            invoicePaths.push(
                `ARSIP/${location}/PPN/${year}/${monthName}/${day}/${filename}`,
                `ARSIP/${location}/NON/${year}/${monthName}/${day}/${filename}`
            );
        }
        
        for (const path of invoicePaths) {
            try {
                const exists = await R2Storage.checkFileExistsNoCache(path);
                if (exists) {
                    invoiceCount = 1;
                    console.log(`[UpdateCount] ? Found invoice: ${path}`);
                    break;
                }
            } catch (err) {
                // Continue checking
            }
        }
        
        // Check bukti bayar
        const buktiPaths = [];
        for (const monthName of monthVariants) {
            buktiPaths.push(`ARSIP/${location}/bukti-bayar/${year}/${monthName}/${day}/${filename}`);
        }
        
        for (const path of buktiPaths) {
            try {
                const exists = await R2Storage.checkFileExistsNoCache(path);
                if (exists) {
                    buktiCount = 1;
                    console.log(`[UpdateCount] ? Found bukti bayar: ${path}`);
                    break;
                }
            } catch (err) {
                // Continue checking
            }
        }
        
        // Check faktur pajak - use path from database if available
        // Otherwise scan multiple folders
        if (invoice && invoice.faktur_pajak_path) {
            try {
                const exists = await R2Storage.checkFileExistsNoCache(invoice.faktur_pajak_path);
                if (exists) {
                    fakturCount = 1;
                    console.log(`[UpdateCount] ? Found faktur pajak (from DB path): ${invoice.faktur_pajak_path}`);
                }
            } catch (err) {
                console.log(`[UpdateCount] Faktur pajak path check failed, trying folder scan...`);
            }
        }
        
        // If not found in DB path, try scanning folders with just faktur number
        if (fakturCount === 0) {
            const fakturFolders = [];
            for (const monthName of monthVariants) {
                fakturFolders.push(
                    `ARSIP/${location}/faktur-pajak/${year}/${monthName}/${day}/`,
                    `ARSIP/${location}/Faktur-Pajak/${year}/${monthName}/${day}/`
                );
            }
            // Try today's date (kasus faktur pajak diunggah sebelum tanggal invoice)
            const today = new Date();
            const todayVariants = R2Storage.monthNameVariants(today.getMonth() + 1);
            for (const monthName of todayVariants) {
                fakturFolders.push(
                    `ARSIP/${location}/faktur-pajak/${today.getFullYear()}/${monthName}/${String(today.getDate()).padStart(2, '0')}/`,
                    `ARSIP/${location}/Faktur-Pajak/${today.getFullYear()}/${monthName}/${String(today.getDate()).padStart(2, '0')}/`
                );
            }
            
            for (const folderPath of fakturFolders) {
                try {
                    // Try to find ANY file with "tax-" prefix and faktur number
                    const possiblePaths = [
                        `${folderPath}tax-${faktur}.pdf`,
                        `${folderPath}tax-${faktur} `,  // prefix to search
                        `${folderPath}${faktur}.pdf`
                    ];
                    
                    for (const testPath of possiblePaths) {
                        try {
                            const exists = await R2Storage.checkFileExistsNoCache(testPath);
                            if (exists) {
                                fakturCount = 1;
                                console.log(`[UpdateCount] ? Found faktur pajak: ${testPath}`);
                                break;
                            }
                        } catch (e) {
                            // Continue
                        }
                    }
                    
                    if (fakturCount === 1) break;
                } catch (err) {
                    // Continue checking next folder
                }
            }
        }
        
        const uploadedCount = invoiceCount + buktiCount + fakturCount;
        const isPPN = invoice?.keterangan?.toUpperCase() === 'PPN';
        const requiredCount = isPPN ? 3 : 2;
        
        console.log(`[UpdateCount] ? R2 scan complete: ${uploadedCount}/${requiredCount}`);
        console.log(`[UpdateCount] Files - Invoice: ${invoiceCount}, Bukti: ${buktiCount}, Faktur Pajak: ${fakturCount}`);
        
        // Save the accurate count to database using direct SQL query (bypass schema cache issues)
        try {
            const { error: updateErr } = await supabaseClient
                .from('invoice_file_list')
                .update({ 
                    files_uploaded_count: uploadedCount,
                    updated_at: new Date().toISOString()
                })
                .eq('faktur', faktur);
            
            if (updateErr) {
                console.warn(`[UpdateCount] Warning: Could not save count to DB:`, updateErr.message);
            } else {
                console.log(`[UpdateCount] ✅ Saved files_uploaded_count=${uploadedCount} to database for faktur ${faktur}`);
            }
        } catch (dbErr) {
            console.warn(`[UpdateCount] DB update attempt failed (non-critical):`, dbErr.message);
        }
        
        // Return the count immediately - this is the source of truth
        return uploadedCount;
        
    } catch (err) {
        console.error(`[UpdateCount] Error:`, err.message);
        return 0;
    }
}

function registerInvoiceEndpoints(app, supabase, createAuth, R2Storage) {

    // Initialize audit logger for this endpoint
    const auditLogger = new AuditLogger(supabase);

    // ============================================================
    // B1: Batas upload yang sedang diproses (backpressure)
    // ============================================================
    // Tanpa batas ini, bulk 200+ file menyebabkan semua body request
    // dibUFFER di RAM (multer memoryStorage) sekaligus -> PM2 me-restart
    // worker (max_memory_restart 1G) -> upload hilang tanpa error ke user.
    // Gate ini dijalankan SEBELUM multer, jadi body yang diprosesiom maksimal
    // MAX_CONCURRENT_UPLOAD_REQUESTS.
    const MAX_CONCURRENT_UPLOAD_REQUESTS = 8;
    let uploadRequestsInFlight = 0;

    const uploadGate = (req, res, next) => {
        if (uploadRequestsInFlight >= MAX_CONCURRENT_UPLOAD_REQUESTS) {
            return res.status(429).json({
                error: 'Server sedang memproses banyak upload. Coba lagi sebentar.',
                retry_after: 5
            });
        }

        uploadRequestsInFlight++;
        let released = false;
        const release = () => {
            if (released) return;
            released = true;
            uploadRequestsInFlight--;
        };
        res.on('finish', release);
        res.on('close', release);
        next();
    };

    // Batas upload R2 yang berjalan bersamaan (Fase 0)
    const uploadQueue = new UploadQueue({
        maxConcurrent: Number(process.env.UPLOAD_QUEUE_CONCURRENCY) || 4,
        maxQueued: Number(process.env.UPLOAD_QUEUE_MAX_PENDING) || 500,
        maxWaitMs: 120000
    });

    // ============================================================
    // SECURITY: Authorization ownership check helper
    // Memastikan admin_zona hanya akses data zona miliknya
    // ============================================================
    function enforceZoneOwnership(req, res, zonaIdRequested) {
        // super_admin dan moderator boleh akses semua zona
        if (['super_admin', 'moderator'].includes(req.user.role)) return true;

        // admin_zona & user hanya boleh akses zona mereka sendiri
        if (zonaIdRequested !== undefined && zonaIdRequested !== null) {
            const requested = parseInt(zonaIdRequested, 10);
            const userZona = parseInt(req.user.zona_id, 10);
            if (!isNaN(requested) && !isNaN(userZona) && requested !== userZona) {
                res.status(403).json({
                    error: 'Akses ditolak: Anda tidak memiliki izin untuk mengakses zona ini.'
                });
                return false;
            }
        }
        return true;
    }
    
    // Check if dependencies are loaded
    if (!multer || !uuid || !parseExcel) {
        console.error('[Invoice Endpoints] ⚠️  Dependencies not loaded. Invoice endpoints will NOT be registered.');
        console.error('[Invoice Endpoints] Required modules: uuid, xlsx, multer');
        console.error('[Invoice Endpoints] Please run: npm install');
        return;
    }
    
    const { v4: uuidv4 } = uuid;
    
    // ============================================================
    // MULTER ERROR WRAPPER for Invoice Endpoints
    // ============================================================
    // Custom middleware to catch multer errors from this instance and return JSON
    const handleMulterError = (err, req, res, next) => {
        if (err instanceof multer.MulterError || (err && err.message)) {
            console.error('[Invoice Multer Error]', err.code || err.message);
            return res.status(400).json({ error: err.message || 'Upload failed' });
        }
        next(err);
    };
    
    // ============================================
    // Helper: Extract location from TOKO column
    // Returns: 'BEKASI' or 'PEMALANG' based on TOKO name
    // ============================================
    function extractLocationFromToko(tokoName) {
        if (!tokoName) return 'BEKASI'; // Default
        
        // Check if TOKO contains 'PEMALANG'
        if (tokoName.includes('PEMALANG')) {
            return 'PEMALANG';
        }
        
        // Default to BEKASI for all others
        return 'BEKASI';
    }
    
    // createAuth is already a factory from server.js that returns [authenticateToken, authorizeRole(...roles)]
    // Use it directly - no need to wrap again
    
    // ============================================
    // GET /api/invoice/health - Test endpoint
    // ============================================
    app.get('/api/invoice/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    
    // ============================================
    // POST /api/invoice/populate-zona-ids
    // Populate zona_id for invoices that don't have it
    // Admin only - repair migration
    // ============================================
    app.post('/api/invoice/populate-zona-ids', createAuth(['super_admin', 'moderator']), async (req, res) => {
        try {
            console.log('[Invoice API] Populating zona_id for invoices...');
            
            // Get all invoices without zona_id
            const { data: invoicesWithoutZona, error: fetchError } = await supabase
                .from('invoice_file_list')
                .select('id, toko')
                .is('zona_id', null);
            
            if (fetchError) {
                console.error('[Invoice API] Error fetching invoices:', fetchError);
                return res.status(500).json({ error: 'Failed to fetch invoices', details: fetchError.message });
            }
            
            console.log(`[Invoice API] Found ${invoicesWithoutZona?.length || 0} invoices without zona_id`);
            
            if (!invoicesWithoutZona || invoicesWithoutZona.length === 0) {
                return res.json({
                    success: true,
                    message: 'All invoices already have zona_id populated',
                    updated: 0
                });
            }
            
            // Populate zona_id from toko table
            let updated = 0;
            let failed = 0;
            
            // ============================================================
            // PERBAIKAN (H5): aturan resolusi yang SAMA dengan upload
            // ============================================================
            // Dulu: 1 query per invoice dengan .eq('nama', inv.toko)
            //       -> case-sensitive & tidak cocok dengan nama toko asli
            //       ->alat perbaikan praktis tidak pernah berhasil.
            // Sekarang: tabel toko dibaca SEKALI, dicocokkan KONSUMEN dulu
            // lalu TOKO (case-insensitive) - identik dengan alur upload.
            const { data: allToko, error: tokoListErr } = await supabase
                .from('toko')
                .select('id, nama, zona_id');
            
            if (tokoListErr) {
                console.error('[Invoice API] Error ambil daftar toko:', tokoListErr.message);
                return res.status(500).json({ error: 'Failed to fetch toko list' });
            }
            
            const tokoByName = new Map();
            (allToko || []).forEach(t => {
                if (t && t.nama) tokoByName.set(String(t.nama).trim().toLowerCase(), t);
            });
            
            // Ambil konsumen + toko untuk pencocokan
            const { data: invoicesToFix } = await supabase
                .from('invoice_file_list')
                .select('id, faktur, toko, konsumen')
                .is('zona_id', null);
            
            for (const inv of invoicesToFix || []) {
                try {
                    const konsumenKey = String(inv.konsumen || '').trim().toLowerCase();
                    const tokoKey = String(inv.toko || '').trim().toLowerCase();
                    
                    const match = (konsumenKey && tokoByName.get(konsumenKey)) ||
                                 (tokoKey && tokoByName.get(tokoKey)) || null;
                    
                    if (match && match.zona_id) {
                        // Update invoice with zona_id
                        const { error: updateError } = await supabase
                            .from('invoice_file_list')
                            .update({ 
                                zona_id: match.zona_id,
                                toko_id: match.id
                            })
                            .eq('id', inv.id);
                        
                        if (updateError) {
                            console.error(`[Invoice API] Error updating invoice ${inv.id}:`, updateError);
                            failed++;
                        } else {
                            updated++;
                            if (updated % 10 === 0) {
                                console.log(`[Invoice API] Progress: ${updated} updated...`);
                            }
                        }
                    } else {
                        console.warn(`[Invoice API] Could not find toko match for: "${inv.toko}" / "${inv.konsumen}"`);
                        failed++;
                    }
                } catch (err) {
                    console.error(`[Invoice API] Error processing invoice ${inv.id}:`, err);
                    failed++;
                }
            }
            
            console.log(`[Invoice API] ? Zona ID population complete: ${updated} updated, ${failed} failed`);
            
            res.json({
                success: true,
                message: `Updated ${updated} invoices with zona_id`,
                updated,
                failed,
                total: invoicesWithoutZona.length
            });
            
        } catch (error) {
            console.error('[Invoice API] Populate zona error:', error);
            res.status(500).json({ error: 'Server error', details: error.message });
        }
    });
    
    // ============================================
    // POST /api/invoice/upload-excel-data
    // Upload pre-parsed Excel data (from frontend validation)
    // RESTRICTED: super_admin & moderator only
    // ============================================
    // ============================================
    // POST /api/invoice/upload-excel-data
    // Upload pre-parsed Excel data (from frontend validation)
    // RESTRICTED: super_admin & moderator only
    // ============================================
    // PERBAIKAN (audit upload Excel):
    //  C1 - Tanggal: baris dengan tanggal tidak valid DITOLAK & dilaporkan
    //       (dulu diam-diam jadi tanggal hari ini / string rusak)
    //  C2 - Insert bukan lagi all-or-nothing: duplikat difilter sebelum insert
    //       + fallback insert per baris kalau ada bentrok
    //  C4 - Tabel toko dibaca SEKALI (bukan 1 query per baris)
    //  H3 - Validasi field per baris (faktur/tanggal/toko)
    //  H7 - Insert per chunk 500 baris (tidak exceeds batas payload)
    //  M4 - Status batch mencerminkan hasil sebenarnya
    //  M6 - Upload ulang file yang sama = no-op (tidak bikin batch baru)
    app.post('/api/invoice/upload-excel-data',
        ...createAuth(['super_admin', 'moderator']),
        async (req, res) => {
            try {
                const { filename, data, summary } = req.body;
                
                if (!data || !Array.isArray(data) || data.length === 0) {
                    return res.status(400).json({ 
                        error: 'No data provided',
                        details: 'Data array is empty or invalid'
                    });
                }
                
                // ============================================================
                // 1. VALIDASI PER BARIS (tolak & laporkan, jangan insert diam-diam)
                // ============================================================
                const validRows = [];
                const rejected = [];
                
                for (const item of data) {
                    const row = {
                        ...item,
                        // Tanggal dinormalisasi ke YYYY-MM-DD (utilitas bersama)
                        tanggal: ExcelUtils.normalizeExcelDate(item.tanggal),
                        // Nominal aman untuk format Indonesia ("1.234,56")
                        total_jumlah_jual: ExcelUtils.parseNominal(item.total_jumlah_jual),
                        toko: item.toko ? String(item.toko).trim() : '',
                        faktur: item.faktur ? String(item.faktur).trim() : ''
                    };
                    
                    const validation = ExcelUtils.validateInvoiceRow(row);
                    if (!validation.valid) {
                        rejected.push({
                            faktur: row.faktur || '-',
                            reason: validation.reason
                        });
                        continue;
                    }
                    
                    validRows.push(row);
                }
                
                if (rejected.length > 0) {
                    console.warn(`[Invoice API] ${rejected.length} baris ditolak (validasi gagal)`);
                }
                
                // ============================================================
                // 2. CEK DUPLIKAT (1 query, bukan per baris)
                // ============================================================
                const fakturs = validRows.map(r => r.faktur);
                const existingFakturs = new Set();
                
                if (fakturs.length > 0) {
                    const CHUNK = 100;
                    for (let i = 0; i < fakturs.length; i += CHUNK) {
                        const chunk = fakturs.slice(i, i + CHUNK);
                        const { data: existingInvoices, error: dupErr } = await supabase
                            .from('invoice_file_list')
                            .select('faktur')
                            .in('faktur', chunk);
                        
                        if (dupErr) {
                            console.error('[Invoice API] Error cek duplikat:', dupErr.message);
                            continue;
                        }
                        (existingInvoices || []).forEach(inv => existingFakturs.add(inv.faktur));
                    }
                }
                
                const newRows = validRows.filter(r => !existingFakturs.has(r.faktur));
                const duplicateRows = validRows.filter(r => existingFakturs.has(r.faktur));
                
                // ============================================================
                // 3. IDEMPOTENCY (M6): tidak ada data baru -> jangan buat batch
                // ============================================================
                if (newRows.length === 0) {
                    console.log(`[Invoice API] Tidak ada faktur baru (${duplicateRows.length} sudah ada) - tidak ada batch dibuat`);
                    return res.json({
                        success: true,
                        batchId: null,
                        message: duplicateRows.length > 0
                            ? 'Semua faktur sudah ada di database - tidak ada data baru yang diupload'
                            : 'Tidak ada data valid untuk diupload',
                        summary: {
                            totalReceived: data.length,
                            processed: 0,
                            duplicates: duplicateRows.length,
                            failed: 0,
                            rejected: rejected.length,
                            rejectedRows: rejected.slice(0, 20)
                        }
                    });
                }
                
                // ============================================================
                // 4. BUAT RECORD BATCH
                // ============================================================
                const batchId = uuidv4();
                const { error: batchError } = await supabase
                    .from('excel_upload_batches')
                    .insert({
                        id: batchId,
                        filename: filename,
                        total_rows: data.length,
                        processed_rows: 0,
                        failed_rows: 0,
                        duplicate_rows: duplicateRows.length,
                        uploaded_by: req.user.id,
                        status: 'processing'
                    });
                
                if (batchError) {
                    console.error('[Invoice API] Error creating batch:', batchError);
                    // Continue anyway, batch is optional
                }
                
                // ============================================================
                // 5. RESOLUSI ZONA - tabel toko dibaca SEKALI (fix N+1)
                // ============================================================
                const { data: allToko } = await supabase
                    .from('toko')
                    .select('id, nama, zona_id');
                
                const tokoByName = new Map();
                (allToko || []).forEach(t => {
                    if (t && t.nama) {
                        tokoByName.set(String(t.nama).trim().toLowerCase(), t);
                    }
                });
                
                // ============================================================
                // 6. BANGUN RECORD INVOICE
                // ============================================================
                const invoiceRecords = newRows.map((row) => {
                    // Cocokkan KONSUMEN dulu (nama toko asli), lalu TOKO
                    const konsumenKey = String(row.konsumen || '').trim().toLowerCase();
                    const tokoKey = String(row.toko || '').trim().toLowerCase();
                    const match = (konsumenKey && tokoByName.get(konsumenKey)) ||
                                 (tokoKey && tokoByName.get(tokoKey)) || null;
                    
                    return {
                        tanggal: row.tanggal,
                        toko: row.toko,
                        zona_id: match && match.zona_id ? match.zona_id : null,
                        faktur: row.faktur,
                        metode_bayar: row.metode_bayar,
                        jenis_transaksi: row.jenis_transaksi,
                        konsumen: row.konsumen,
                        keterangan: row.keterangan,
                        total_jumlah_jual: row.total_jumlah_jual,
                        item_count: parseInt(row.item_count) || 1,
                        status: 'PENDING',
                        excel_batch_id: batchId,
                        excel_uploaded_at: new Date().toISOString(),
                        excel_uploaded_by: req.user.id
                    };
                });
                
                // ============================================================
                // 7. INSERT PER CHUNK (H7) + fallback per baris (C2)
                // ============================================================
                const INSERT_CHUNK = 500;
                let processedCount = 0;
                let failedCount = 0;
                const errors = [];
                
                for (let i = 0; i < invoiceRecords.length; i += INSERT_CHUNK) {
                    const chunk = invoiceRecords.slice(i, i + INSERT_CHUNK);
                    
                    const { error: insertError } = await supabase
                        .from('invoice_file_list')
                        .insert(chunk);
                    
                    if (!insertError) {
                        processedCount += chunk.length;
                        continue;
                    }
                    
                    // Insert chunk gagal (mis. bentrok unique) -> insert per baris
                    // supaya baris yang valid tetap tersimpan
                    console.error(`[Invoice API] Bulk insert chunk ${Math.floor(i / INSERT_CHUNK) + 1} gagal (${insertError.code || insertError.message}) - fallback per baris`);
                    
                    for (const record of chunk) {
                        try {
                            const { error: rowError } = await supabase
                                .from('invoice_file_list')
                                .insert(record);
                            
                            if (rowError) {
                                failedCount++;
                                if (errors.length < 20) {
                                    errors.push({ faktur: record.faktur, reason: rowError.message });
                                }
                            } else {
                                processedCount++;
                            }
                        } catch (rowErr) {
                            failedCount++;
                            if (errors.length < 20) {
                                errors.push({ faktur: record.faktur, reason: rowErr.message });
                            }
                        }
                    }
                }
                
                // ============================================================
                // 8. UPDATE BATCH (M4: status mencerminkan hasil sebenarnya)
                // ============================================================
                const hasIssues = failedCount > 0 || rejected.length > 0;
                const batchStatus = processedCount === 0
                    ? 'failed'
                    : (hasIssues ? 'completed_with_errors' : 'completed');
                
                await supabase
                    .from('excel_upload_batches')
                    .update({
                        processed_rows: processedCount,
                        failed_rows: failedCount + rejected.length,
                        duplicate_rows: duplicateRows.length,
                        status: batchStatus
                    })
                    .eq('id', batchId);
                
                // Log to audit trail
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: req.user.userId,
                    userEmail: req.user.email,
                    userRole: req.user.role,
                    zonaId: null,
                    action: 'Upload Invoice Batch (Excel Data)',
                    resourceType: 'invoice_batch',
                    resourceId: batchId,
                    resourceName: filename || `Batch ${batchId}`,
                    operation: 'CREATE',
                    details: {
                        filename,
                        totalReceived: data.length,
                        processed: processedCount,
                        duplicates: duplicateRows.length,
                        failed: failedCount,
                        rejected: rejected.length,
                        batchId
                    },
                    ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: '/api/invoice/upload-excel-data',
                    requestMethod: 'POST',
                    statusCode: 200,
                    responseMessage: `Uploaded ${processedCount} invoices`,
                    errorMessage: (failedCount + rejected.length) > 0
                        ? `${failedCount} failed, ${rejected.length} rejected, ${duplicateRows.length} duplicates`
                        : null,
                    isSuspicious: false,
                    severity: 'info'
                }).catch(err => {
                    console.warn('[Invoice API] Audit log failed:', err.message);
                });
                
                res.json({
                    success: true,
                    batchId,
                    message: processedCount > 0
                        ? `${processedCount} invoice baru diupload`
                        : 'Tidak ada data baru yang diupload',
                    summary: {
                        totalReceived: data.length,
                        processed: processedCount,
                        duplicates: duplicateRows.length,
                        failed: failedCount,
                        rejected: rejected.length,
                        rejectedRows: rejected.slice(0, 20),
                        errors: errors.slice(0, 20)
                    }
                });
                
            } catch (error) {
                console.error('[Invoice API] Upload data error:', error);
                res.status(500).json({ error: 'Server error', details: error.message });
            }
        }
    );

    // ============================================
    // POST /api/invoice/check-duplicate-fakturs
    // Check if fakturs already exist in database
    // RESTRICTED: super_admin & moderator only
    // ============================================
    app.post('/api/invoice/check-duplicate-fakturs',
        ...createAuth(['super_admin', 'moderator']),
        async (req, res) => {
            try {
                const { fakturs } = req.body;

                console.log(`[Invoice API] Duplicate check by ${req.user?.name}: checking ${fakturs?.length || 0} fakturs`);

                if (!fakturs || !Array.isArray(fakturs) || fakturs.length === 0) {
                    return res.status(400).json({
                        error: 'No fakturs provided',
                        details: 'Fakturs array is required and must not be empty'
                    });
                }

                // Filter out empty/null fakturs
                const validFakturs = fakturs.filter(f => f && f.trim());

                if (validFakturs.length === 0) {
                    return res.status(400).json({
                        error: 'No valid fakturs provided',
                        details: 'All fakturs are empty or invalid'
                    });
                }

                console.log(`[Invoice API] Checking ${validFakturs.length} valid fakturs...`);
                console.log(`[Invoice API] Sample fakturs:`, validFakturs.slice(0, 5));

                // Query database for existing fakturs using batches to avoid URL overflow
                // Process in chunks of 100 to keep URL under 16KB limit
                const batchSize = 100;
                const existingFaktursList = [];
                
                for (let i = 0; i < validFakturs.length; i += batchSize) {
                    const batch = validFakturs.slice(i, i + batchSize);
                    console.log(`[Invoice API] Querying batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(validFakturs.length/batchSize)} (${batch.length} fakturs)...`);
                    
                    const { data: batchResults, error: queryError } = await supabase
                        .from('invoice_file_list')
                        .select('faktur')
                        .in('faktur', batch);

                    if (queryError) {
                        console.error('[Invoice API] Query error on batch:', queryError);
                        return res.status(500).json({
                            error: 'Database query failed',
                            details: queryError.message
                        });
                    }

                    // Collect results from this batch
                    if (batchResults && batchResults.length > 0) {
                        existingFaktursList.push(...batchResults.map(inv => inv.faktur));
                    }
                }

                // Build list of duplicates
                const duplicates = validFakturs.filter(f => existingFaktursList.includes(f));

                console.log(`[Invoice API] Found ${duplicates.length} duplicates out of ${validFakturs.length}`);
                if (duplicates.length > 0) {
                    console.log(`[Invoice API] Duplicates:`, duplicates.slice(0, 10));
                }

                res.json({
                    success: true,
                    totalChecked: validFakturs.length,
                    duplicateCount: duplicates.length,
                    duplicates: duplicates,
                    hasDuplicates: duplicates.length > 0
                });

            } catch (error) {
                console.error('[Invoice API] Duplicate check error:', error);
                res.status(500).json({
                    error: 'Server error',
                    details: error.message
                });
            }
        }
    );

    // ============================================
    // POST /api/invoice/upload-excel
    // Upload and parse Excel file (REKAP_LABA.xls)
    // ============================================
    // TEST ENDPOINT - just capture file without parsing (NO AUTH for debugging)
    app.post('/api/invoice/test-upload', 
        upload.single('excel'),
        handleMulterError,
        async (req, res) => {
            try {
                console.log('[TEST] File received:');
                console.log('[TEST] Name:', req.file?.originalname);
                console.log('[TEST] Size:', req.file?.size);
                console.log('[TEST] Mime:', req.file?.mimetype);
                console.log('[TEST] Buffer length:', req.file?.buffer?.length);
                console.log('[TEST] Buffer type:', typeof req.file?.buffer);
                console.log('[TEST] Is Buffer:', Buffer.isBuffer(req.file?.buffer));
                
                // Try to log first 100 bytes as hex
                if (req.file?.buffer && req.file.buffer.length > 0) {
                    const hex = req.file.buffer.slice(0, 100).toString('hex');
                    console.log('[TEST] First 100 bytes (hex):', hex);
                }
                
                res.json({
                    received: true,
                    file: {
                        name: req.file?.originalname,
                        size: req.file?.size,
                        bufferLength: req.file?.buffer?.length,
                        isBuffer: Buffer.isBuffer(req.file?.buffer)
                    }
                });
            } catch (err) {
                console.error('[TEST] Error:', err);
                res.status(500).json({ error: err.message });
            }
        }
    );

    app.post('/api/invoice/upload-excel', 
        ...createAuth(['super_admin', 'moderator']),
        upload.single('excel'),
        handleMulterError,
        async (req, res) => {
            console.log('[Invoice API] Upload endpoint hit');
            
            try {
                if (!req.file) {
                    console.error('[Invoice API] No file');
                    return res.status(400).json({ error: 'No file uploaded' });
                }
                
                console.log(`[Invoice API] Excel upload by ${req.user?.name}: ${req.file.originalname}`);
                console.log(`[Invoice API] File size: ${req.file.size} bytes`);
                
                // Parse Excel
                console.log('[Invoice API] Calling parseExcel()...');
                const parseResult = parseExcel(req.file.buffer);
                console.log('[Invoice API] parseExcel returned:', parseResult.success ? 'SUCCESS' : 'FAILED');
                
                if (!parseResult.success) {
                    console.error('[Invoice API] Parse failed:', parseResult.error);
                    return res.status(400).json({ 
                        error: 'Failed to parse Excel file',
                        details: parseResult.error
                    });
                }
                
                console.log('[Invoice API] Parsed data count:', parseResult.data.length);
                
                // Validate data
                const validation = validateData(parseResult.data);
                if (!validation.isValid) {
                    console.error('[Invoice API] Validation errors:', validation.errors);
                    return res.status(400).json({
                        error: 'Data validation failed',
                        details: 'Silakan cek format Excel Anda',
                        errors: validation.errors.slice(0, 15),
                        totalErrors: validation.errors.length
                    });
                }
                
                // Create batch record
                const batchId = uuidv4();
                const { data: batch, error: batchError } = await supabase
                    .from('excel_upload_batches')
                    .insert({
                        id: batchId,
                        filename: req.file.originalname,
                        total_rows: parseResult.summary.totalRows,
                        processed_rows: 0,
                        failed_rows: 0,
                        duplicate_rows: 0,
                        uploaded_by: req.user.id,
                        status: 'processing'
                    })
                    .select()
                    .single();
                
                if (batchError) {
                    console.error('[Invoice API] Error creating batch:', batchError);
                    return res.status(500).json({ error: 'Failed to create batch record' });
                }
                
                console.log('[Invoice API] Batch created:', batchId);
                
                // Insert invoices
                let processedCount = 0;
                let duplicateCount = 0;
                let failedCount = 0;
                let skippedReturs = 0;
                const errors = [];
                
                for (const item of parseResult.data) {
                    try {
                        // FILTER: Skip RETUR transactions
                        const transType = String(item.jenis_transaksi || 'jual').toLowerCase().trim();
                        if (transType === 'retur' || transType === 'return') {
                            skippedReturs++;
                            console.log(`[Invoice API] Skipping RETUR transaction: ${item.faktur}`);
                            continue;
                        }
                        
                        // Check if faktur already exists
                        const { data: existing } = await supabase
                            .from('invoice_file_list')
                            .select('id, faktur')
                            .eq('faktur', item.faktur)
                            .single();
                        
                        if (existing) {
                            duplicateCount++;
                            console.log(`[Invoice API] Duplicate faktur: ${item.faktur}`);
                            continue;
                        }
                        
                        // Insert new invoice
                        const { error: insertError } = await supabase
                            .from('invoice_file_list')
                            .insert({
                                tanggal: item.tanggal_formatted,
                                toko: item.toko,
                                toko_raw: item.toko_raw,
                                faktur: item.faktur,
                                metode_bayar: item.metode_bayar,
                                jenis_transaksi: item.jenis_transaksi,
                                konsumen: item.konsumen,
                                keterangan: item.keterangan,
                                total_jumlah_jual: item.total_jumlah_jual,
                                item_count: item.item_count,
                                status: 'PENDING',
                                excel_batch_id: batchId,
                                excel_uploaded_at: new Date().toISOString(),
                                excel_uploaded_by: req.user.id
                            });
                        
                        if (insertError) {
                            failedCount++;
                            errors.push(`${item.faktur}: ${insertError.message}`);
                            console.error(`[Invoice API] Error inserting ${item.faktur}:`, insertError);
                        } else {
                            processedCount++;
                        }
                        
                    } catch (err) {
                        failedCount++;
                        errors.push(`${item.faktur}: ${err.message}`);
                        console.error(`[Invoice API] Error processing ${item.faktur}:`, err);
                    }
                }
                
                // Update batch status
                await supabase
                    .from('excel_upload_batches')
                    .update({
                        processed_rows: processedCount,
                        failed_rows: failedCount,
                        duplicate_rows: duplicateCount,
                        status: failedCount > 0 ? 'completed_with_errors' : 'completed',
                        error_log: errors.length > 0 ? errors.join('\n') : null
                    })
                    .eq('id', batchId);
                
                // Log to audit
                await supabase.from('audit_logs').insert({
                    user_id: req.user.id,
                    action: 'upload_excel',
                    context: `Uploaded ${req.file.originalname}: ${processedCount} processed, ${duplicateCount} duplicates, ${failedCount} failed, ${skippedReturs} retur skipped`
                });
                
                res.json({
                    success: true,
                    batchId,
                    summary: {
                        totalRows: parseResult.summary.totalRows,
                        uniqueFakturs: parseResult.summary.uniqueFakturs,
                        processed: processedCount,
                        duplicates: duplicateCount,
                        failed: failedCount,
                        skippedReturs: skippedReturs,
                        errors: errors.slice(0, 10)
                    }
                });
                
            } catch (error) {
                console.error('[Invoice API] Upload error:', error);
                return res.status(500).json({ 
                    error: error.message,
                    stack: error.stack
                });
            }
        }
    );
    
    // ============================================
    // GET /api/invoice/list
    // Get invoice file list with filters
    // ============================================
    app.get('/api/invoice/list', createAuth(), async (req, res) => {
        try {
            // SECURITY: Cek zona ownership jika ada zona_id di query
            if (req.query.zona_id) {
                if (!enforceZoneOwnership(req, res, req.query.zona_id)) return;
            }

            const { 
                status, 
                toko, 
                keterangan,
                date_from,
                date_to,
                search,
                sort_by = 'tanggal',
                sort_order = 'desc',
                limit = 100,
                offset = 0
            } = req.query;
            
            let query = supabase
                .from('invoice_file_list')
                .select('*', { count: 'exact' });
            
            // Auto-filter by zona for admin_zona users
            if (req.user && req.user.role === 'admin_zona' && req.user.zona_id) {
                const userZonaId = parseInt(req.user.zona_id) || req.user.zona_id;
                console.log(`[Invoice List] Filtering for admin_zona with zona_id: ${userZonaId} (type: ${typeof userZonaId}, orig: ${req.user.zona_id})`);
                query = query.eq('zona_id', userZonaId);
            } else if (req.user) {
                console.log(`[Invoice List] User role: ${req.user.role}, zona_id: ${req.user.zona_id}`);
            }
            
            // Apply filters
            if (status) {
                query = query.eq('status', status);
            }
            
            if (toko) {
                query = query.eq('toko', toko);
            }
            
            if (keterangan) {
                query = query.eq('keterangan', keterangan);
            }
            
            if (date_from) {
                query = query.gte('tanggal', date_from);
            }
            
            if (date_to) {
                query = query.lte('tanggal', date_to);
            }
            
            if (search) {
                // --- SECURITY FIX #9: SQL injection prevention in search ---
                // Sanitize search term: remove special characters that could break the ilike query
                // Supabase ilike is safe against SQL injection (parameterized under the hood)
                // but we still sanitize to prevent accidental filter bypass
                const sanitizedSearch = sanitizeString(search.trim());
                
                // Only apply search if sanitized result is not empty
                if (sanitizedSearch && sanitizedSearch.length > 0) {
                    query = query.or(`faktur.ilike.%${sanitizedSearch}%,konsumen.ilike.%${sanitizedSearch}%`);
                }
            }
            
            // Order by specified field and direction
            // Validate sort_by to prevent injection (only allow specific fields)
            const allowedSortFields = ['tanggal', 'status', 'total_jumlah_jual', 'created_at', 'konsumen', 'toko'];
            const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'tanggal';
            const sortAsc = sort_order === 'asc';
            
            query = query
                .order(sortField, { ascending: sortAsc })
                .order('created_at', { ascending: sortAsc })
                .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
            
            const { data, error, count } = await query;
            
            if (error) {
                console.error('[Invoice API] Error fetching list:', error);
                console.error('[Invoice API] Error details:', {
                    code: error.code,
                    message: error.message,
                    details: error.details,
                    hint: error.hint
                });
                return res.status(500).json({ error: 'Failed to fetch invoice list', details: error.message });
            }
            
            console.log(`[Invoice List] Returned ${data?.length || 0} invoices (total: ${count})`);
            
            // Map data to include file count
            // IMPORTANT: Use cached database count, not live R2 scans (expensive operation)
            // R2 scans happen only when user filters by month (via dedicated endpoint: /api/invoice/scan-filtered)
            const enrichedData = data.map(inv => {
                // Use cached count from database
                const filesUploaded = inv.files_uploaded_count || 0;
                
                // Debug logging for test fakturs only
                if (inv.faktur && (inv.faktur === '835100311020926004' || inv.faktur === '835100311010926025')) {
                    console.log(`[Invoice List] Invoice ${inv.faktur} CACHED count:`, {
                        files_uploaded_count: filesUploaded,
                        db_invoice_path: inv.invoice_pdf_path ? '✓' : '✗',
                        db_bukti_path: inv.bukti_bayar_path ? '✓' : '✗',
                        db_faktur_path: inv.faktur_pajak_path ? '✓' : '✗'
                    });
                }
                
                const isPPN = inv.keterangan && inv.keterangan.toUpperCase() === 'PPN';
                const filesRequired = isPPN ? 3 : 2;
                
                return {
                    ...inv,
                    files_uploaded_count: filesUploaded,
                    files_required_count: filesRequired
                };
            });
            
            // ============================================
            // Calculate aggregated stats from paginated data (OPTIMIZED)
            // CHANGE: Compute stats from current page only + return estimated totals
            // Frontend caches stats and refreshes on demand (prevents O(n) queries)
            // ============================================
            let aggregatedStats = null;
            
            // Calculate stats from current page data only (already loaded, no extra query)
            if (enrichedData && enrichedData.length > 0) {
                let lunasCount = 0;
                let belumLunasCount = 0;
                let totalAmount = 0;
                let lunasAmount = 0;
                let belumLunasAmount = 0;
                
                enrichedData.forEach(inv => {
                    const filesUploaded = inv.files_uploaded_count || 0;
                    const isPPN = inv.keterangan && inv.keterangan.toUpperCase() === 'PPN';
                    const filesRequired = isPPN ? 3 : 2;
                    const isComplete = filesUploaded >= filesRequired;
                    
                    const nominal = parseFloat(inv.total_jumlah_jual) || 0;
                    totalAmount += nominal;
                    
                    if (isComplete) {
                        lunasCount++;
                        lunasAmount += nominal;
                    } else {
                        belumLunasCount++;
                        belumLunasAmount += nominal;
                    }
                });
                
                // Calculate sampling ratio (current page / total)
                const pageRatio = enrichedData.length / count;
                
                aggregatedStats = {
                    // Actual totals for accurate stats
                    totalCount: count,
                    lunasCount: Math.round(lunasCount / pageRatio),
                    belumLunasCount: Math.round(belumLunasCount / pageRatio),
                    totalAmount: Math.round(totalAmount / pageRatio),
                    lunasAmount: Math.round(lunasAmount / pageRatio),
                    belumLunasAmount: Math.round(belumLunasAmount / pageRatio),
                    // Metadata for frontend caching
                    isSampled: true,  // Stats are calculated from page sample
                    sampleSize: enrichedData.length
                };
                
                console.log(`[Invoice List] Stats (sampled from ${enrichedData.length}/${count} invoices):`, aggregatedStats);
            }
            
            // Debug: Show sample data if admin_zona returns 0 results
            if (req.user && req.user.role === 'admin_zona' && count === 0) {
                console.warn(`[Invoice List] ?? Admin_zona ${req.user.userId} (zona_id: ${req.user.zona_id}) returned 0 invoices!`);
                // Check if invoices exist at all for this zona
                const { count: checkCount, error: checkErr } = await supabase
                    .from('invoice_file_list')
                    .select('id', { count: 'exact', head: true })
                    .eq('zona_id', parseInt(req.user.zona_id) || req.user.zona_id);
                console.warn(`[Invoice List] Total invoices in zona ${req.user.zona_id}:`, checkCount, checkErr);
            }
            
            res.json({
                success: true,
                data: enrichedData,
                count,
                limit: parseInt(limit),
                offset: parseInt(offset),
                aggregatedStats,  // Include aggregated stats for accurate stat cards
                _refreshedAt: new Date().toISOString()  // Cache busting
            });
            
        } catch (error) {
            console.error('[Invoice API] List error:', error);
            console.error('[Invoice API] Stack:', error.stack);
            res.status(500).json({ error: 'Server error', details: error.message });
        }
    });

    // ============================================
    // GET /api/invoice/filter-options
    // ============================================
    // PERF: endpoint ringan untuk mengisi dropdown filter (Tahun/Bulan/Toko/Kategori).
    // Sebelumnya frontend memakai /api/invoice/list?limit=10000 yang menarik
    // SELURUH baris invoice (8.000+ baris, semua kolom) hanya untuk mengisi dropdown.
    // Endpoint ini hanya mengambil 4 kolom (toko, konsumen, keterangan, tanggal)
    // tanpa count, lalu computes distinct di server.
    // Tidak ada perubahan pada data.
    // ============================================
    app.get('/api/invoice/filter-options', createAuth(), async (req, res) => {
        try {
            const MAX_ROWS = 20000;
            
            let query = supabase
                .from('invoice_file_list')
                .select('toko, konsumen, keterangan, tanggal, tanggal_dokumen');
            
            // Auto-filter by zona for admin_zona users
            if (req.user && req.user.role === 'admin_zona' && req.user.zona_id) {
                const userZonaId = parseInt(req.user.zona_id) || req.user.zona_id;
                query = query.eq('zona_id', userZonaId);
            }
            
            query = query.limit(MAX_ROWS);
            
            let { data, error } = await query;
            
            // Fallback: schema lama mungkin tidak punya tanggal_dokumen
            if (error && /tanggal_dokumen|does not exist/i.test(error.message || '')) {
                console.warn('[Invoice API] Filter options: fallback select tanpa tanggal_dokumen');
                let fallbackQuery = supabase
                    .from('invoice_file_list')
                    .select('toko, konsumen, keterangan, tanggal');
                if (req.user && req.user.role === 'admin_zona' && req.user.zona_id) {
                    fallbackQuery = fallbackQuery.eq('zona_id', parseInt(req.user.zona_id) || req.user.zona_id);
                }
                const fallback = await fallbackQuery.limit(MAX_ROWS);
                data = fallback.data;
                error = fallback.error;
            }
            
            if (error) {
                console.error('[Invoice API] Filter options error:', error.message);
                return res.status(500).json({ error: 'Failed to fetch filter options' });
            }
            
            const rows = data || [];
            const years = new Set();
            const tokoSet = new Set();
            const konsumenSet = new Set();
            const keterangans = new Set();
            let total = rows.length;
            
            rows.forEach(row => {
                if (row.toko) tokoSet.add(row.toko);
                if (row.konsumen) konsumenSet.add(row.konsumen);
                if (row.keterangan) keterangans.add(row.keterangan);
                
                const dateField = row.tanggal || row.tanggal_dokumen;
                if (dateField) {
                    const year = String(dateField).slice(0, 4);
                    if (/^\d{4}$/.test(year)) years.add(year);
                }
            });
            
            // Total invoice (untuk pagination) - query terpisah, head only
            let totalCount = null;
            try {
                let countQuery = supabase
                    .from('invoice_file_list')
                    .select('*', { count: 'exact', head: true });
                if (req.user && req.user.role === 'admin_zona' && req.user.zona_id) {
                    countQuery = countQuery.eq('zona_id', parseInt(req.user.zona_id) || req.user.zona_id);
                }
                const { count } = await countQuery;
                if (typeof count === 'number') totalCount = count;
            } catch (countErr) {
                // abaikan - count hanya untuk info pagination
            }
            
            res.json({
                success: true,
                years: Array.from(years).sort().reverse(),
                toko: Array.from(tokoSet).sort(),
                konsumen: Array.from(konsumenSet).sort(),
                keterangans: Array.from(keterangans).sort(),
                total,
                totalCount,
                truncated: total >= MAX_ROWS
            });
            
        } catch (error) {
            console.error('[Invoice API] Filter options error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // ============================================
    // POST /api/invoice/scan-filtered
    // Batch scan R2 for filtered invoices (called from frontend when user applies filters)
    // This is expensive, so only call when needed (not on initial page load)
    // ============================================
    app.post('/api/invoice/scan-filtered', createAuth(), async (req, res) => {
        try {
            const { 
                toko, 
                keterangan,
                date_from,
                date_to,
                search,
                force = false
            } = req.body;

            console.log('[Invoice Scan] Batch scan request received');

            // SECURITY: Cek zona ownership jika ada zona_id di body
            if (req.body.zona_id) {
                if (!enforceZoneOwnership(req, res, req.body.zona_id)) {
                    return;
                }
            }
            
            // ============================================================
            // PERF: batasi cakupan scan background
            // ============================================================
            // Default: hanya scan invoice yang files_uploaded_count = 0
            // (file kemungkinan hilang / diunggah langsung ke R2 di luar aplikasi).
            // Invoice yang sudah punya count > 0 tidak perlu di-scan ulang:
            // count-nya sudah di-maintain oleh upload flow + trigger database.
            //_scanMax membatasi jumlah invoice per request supaya R2 tidak dibanjiri.
            const SCAN_MAX = 50;
            let scanQuery = supabase
                .from('invoice_file_list')
                .select('faktur, files_uploaded_count');
            
            // Auto-filter by zona for admin_zona users
            if (req.user && req.user.role === 'admin_zona' && req.user.zona_id) {
                const userZonaId = parseInt(req.user.zona_id) || req.user.zona_id;
                scanQuery = scanQuery.eq('zona_id', userZonaId);
            }
            
            // Apply same filters as invoice list endpoint
            if (toko) scanQuery = scanQuery.eq('toko', toko);
            if (keterangan) scanQuery = scanQuery.eq('keterangan', keterangan);
            if (date_from) scanQuery = scanQuery.gte('tanggal', date_from);
            if (date_to) scanQuery = scanQuery.lte('tanggal', date_to);
            
            if (search) {
                const sanitizedSearch = sanitizeString(search.trim());
                if (sanitizedSearch && sanitizedSearch.length > 0) {
                    scanQuery = scanQuery.or(`faktur.ilike.%${sanitizedSearch}%,konsumen.ilike.%${sanitizedSearch}%`);
                }
            }

            // Hanya invoice yang belum punya hitungan file (kecuali force=true)
            if (!force) {
                scanQuery = scanQuery.eq('files_uploaded_count', 0);
            }
            scanQuery = scanQuery.limit(SCAN_MAX);

            // RETURN IMMEDIATELY - don't block on R2 scan
            res.json({
                success: true,
                message: 'Background scan started',
                maxScan: SCAN_MAX,
                _startedAt: new Date().toISOString()
            });

            // ==== NOW DO THE SCAN IN THE BACKGROUND (don't await) ====
            (async () => {
                try {
                    const { data: invoices, error } = await scanQuery;
                    
                    if (error) {
                        console.error('[Invoice Scan BG] Error fetching invoices:', error.message);
                        return;
                    }

                    if (!invoices || invoices.length === 0) {
                        console.log('[Invoice Scan BG] No invoices to scan (count: ' + (invoices ? invoices.length : 'null') + ')');
                        return;
                    }
                    
                    console.log('[Invoice Scan BG] Starting R2 scan for ' + invoices.length + ' invoices (max ' + SCAN_MAX + ')');
                    
                    // Start background R2 scan
                    let scannedCount = 0;
                    for (const inv of invoices) {
                        try {
                            await updateFilesUploadedCount(supabase, inv.faktur, R2Storage);
                            scannedCount++;
                        } catch (err) {
                            console.error('[Invoice Scan BG] Error scanning ' + inv.faktur + ':', err.message);
                        }
                        // Jeda singkat agar R2 tidak dibanjiri request beruntun
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                    
                    console.log('[Invoice Scan BG] Completed: ' + scannedCount + ' invoices scanned');
                } catch (err) {
                    console.error('[Invoice Scan BG] Background scan error:', err.message);
                    console.error('[Invoice Scan BG] Stack:', err.stack);
                }
            })();

        } catch (error) {
            console.error('[Invoice Scan] Error:', error);
            res.status(500).json({ error: 'Scan failed', details: error.message });
        }
    });
    
    // ============================================
    // GET /api/invoice/zona/:zonaId/summary
    // Get toko summary for a specific zona
    // ============================================
    app.get('/api/invoice/zona/:zonaId/summary', createAuth(), async (req, res) => {
        try {
            const zonaId = parseInt(req.params.zonaId) || req.params.zonaId;

            // SECURITY: Cek zona ownership
            if (!enforceZoneOwnership(req, res, zonaId)) return;
            
            // Fetch invoices for this zona
            const { data: invoices, error } = await supabase
                .from('invoice_file_list')
                .select('*')
                .eq('zona_id', zonaId);
            
            if (error) {
                console.error('[Invoice API] Error fetching zona summary:', error);
                return res.status(500).json({ error: 'Failed to fetch zona summary' });
            }
            
            // Aggregate by toko
            const tokoStats = {};
            invoices.forEach(inv => {
                if (!tokoStats[inv.toko]) {
                    tokoStats[inv.toko] = {
                        toko: inv.toko,
                        total: 0,
                        pending: 0,
                        uploaded: 0,
                        missing: 0,
                        total_nominal: 0,
                        latest_date: null
                    };
                }
                tokoStats[inv.toko].total++;
                tokoStats[inv.toko][inv.status?.toLowerCase() || 'missing']++;
                tokoStats[inv.toko].total_nominal += inv.total_jumlah_jual || 0;
                
                if (!tokoStats[inv.toko].latest_date || inv.tanggal > tokoStats[inv.toko].latest_date) {
                    tokoStats[inv.toko].latest_date = inv.tanggal;
                }
            });
            
            const summary = Object.values(tokoStats).sort((a, b) => b.total - a.total);
            
            console.log(`[Invoice API] Zona ${zonaId} summary: ${summary.length} toko, ${invoices.length} total invoices`);
            
            res.json({
                success: true,
                zona_id: zonaId,
                total_invoices: invoices.length,
                total_toko: summary.length,
                toko_summary: summary
            });
            
        } catch (error) {
            console.error('[Invoice API] Zona summary error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });
    
    // ============================================
    // Get invoice statistics
    // ============================================
    app.get('/api/invoice/stats', createAuth(), async (req, res) => {
        const startTime = performance.now();
        try {
            const { data, error } = await supabase
                .rpc('get_invoice_statistics');
            
            if (error) {
                console.error('[Invoice API] Error fetching stats:', error);
                const duration = performance.now() - startTime;
                console.error(`[API] GET /api/invoice/stats FAILED: ${duration.toFixed(2)}ms -`, error.message);
                return res.status(500).json({ error: 'Failed to fetch statistics' });
            }
            
            const duration = performance.now() - startTime;
            console.log(`[API] GET /api/invoice/stats: ${duration.toFixed(2)}ms`);
            
            res.json({
                success: true,
                stats: data[0] || {}
            });
            
        } catch (error) {
            const duration = performance.now() - startTime;
            console.error(`[API] GET /api/invoice/stats FAILED: ${duration.toFixed(2)}ms -`, error.message);
            res.status(500).json({ error: 'Server error' });
        }
    });
    
    // ============================================
    // GET /api/invoice/batches
    // Get list of Excel upload batches
    // ============================================
    app.get('/api/invoice/batches', 
        ...createAuth(['super_admin', 'moderator']),
        async (req, res) => {
            try {
                const { limit = 50, offset = 0 } = req.query;
                
                const { data, error, count } = await supabase
                    .from('excel_upload_batches')
                    .select(`
                        *,
                        uploader:uploaded_by(name, email)
                    `, { count: 'exact' })
                    .neq('status', 'deleted')
                    .order('created_at', { ascending: false })
                    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
                
                if (error) {
                    console.error('[Invoice API] Batches error:', error);
                    return res.status(500).json({ error: 'Failed to fetch batches' });
                }
                
                res.json({
                    success: true,
                    data,
                    count,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                });
                
            } catch (error) {
                console.error('[Invoice API] Batches error:', error);
                res.status(500).json({ error: 'Server error' });
            }
        }
    );
    

    // ============================================
    // DELETE /api/invoice/:faktur
    // Delete invoice from list
    // ============================================
    app.delete('/api/invoice/:faktur', 
        ...createAuth(['super_admin', 'moderator']),
        async (req, res) => {
            try {
                const { faktur } = req.params;
                const startTime = Date.now();
                
                console.log(`[Invoice API] Delete request for faktur: ${faktur}`);
                
                // Get invoice data to get file paths
                const { data: invoice, error: fetchError } = await supabase
                    .from('invoice_file_list')
                    .select('*')
                    .eq('faktur', faktur)
                    .single();
                
                if (fetchError) {
                    console.warn(`[Invoice API] Invoice not found: ${faktur}`);
                    const { ipAddress } = AuditLogger.extractClientInfo(req);
                    await auditLogger.log({
                        userId: req.user.userId,
                        userEmail: req.user.email,
                        userRole: req.user.role,
                        zonaId: null,
                        action: 'Delete Invoice - Not Found',
                        resourceType: 'invoice',
                        resourceId: faktur,
                        resourceName: faktur,
                        operation: 'DELETE',
                        ipAddress: ipAddress,
                        userAgent: req.headers['user-agent'] || 'Unknown',
                        requestPath: `/api/invoice/${faktur}`,
                        requestMethod: 'DELETE',
                        statusCode: 404,
                        responseMessage: null,
                        errorMessage: 'Invoice not found',
                        isSuspicious: false,
                        severity: 'warning'
                    }).catch(() => {});
                    return res.status(404).json({ error: 'Invoice not found' });
                }
                
                // SECURITY: Verifikasi user boleh akses invoice ini berdasarkan zona_id
                if (!enforceZoneOwnership(req, res, invoice.zona_id)) return;
                
                // Delete files from Google Drive if they exist
                const filesToDelete = [];
                const deleteErrors = [];
                
                if (invoice.invoice_pdf_path) {
                    filesToDelete.push({
                        name: 'Invoice PDF',
                        path: invoice.invoice_pdf_path
                    });
                }
                
                if (invoice.bukti_bayar_path) {
                    filesToDelete.push({
                        name: 'Bukti Bayar',
                        path: invoice.bukti_bayar_path
                    });
                }
                
                if (invoice.faktur_pajak_path) {
                    filesToDelete.push({
                        name: 'Faktur Pajak',
                        path: invoice.faktur_pajak_path
                    });
                }
                
                // Delete each file from Google Drive
                for (const file of filesToDelete) {
                    try {
                        console.log(`[Invoice API] Deleting ${file.name}: ${file.path}`);
                        await R2Storage.deleteFile(file.path);
                        console.log(`[Invoice API] ✓ Deleted ${file.name}`);
                    } catch (deleteErr) {
                        console.warn(`[Invoice API] Warning: Failed to delete ${file.name}:`, deleteErr.message);
                        deleteErrors.push({
                            file: file.name,
                            error: deleteErr.message
                        });
                        // Continue deleting other files even if one fails
                    }
                }
                
                // Now delete invoice from database
                const { error: dbError } = await supabase
                    .from('invoice_file_list')
                    .delete()
                    .eq('faktur', faktur);
                
                if (dbError) {
                    console.error('[Invoice API] Delete error:', dbError);
                    const { ipAddress } = AuditLogger.extractClientInfo(req);
                    await auditLogger.log({
                        userId: req.user.userId,
                        userEmail: req.user.email,
                        userRole: req.user.role,
                        zonaId: invoice.zona_id,                        action: 'Delete Invoice - Database Failure',
                        resourceType: 'invoice',
                        resourceId: faktur,
                        resourceName: faktur,
                        operation: 'DELETE',
                        details: {
                            filesDeleted: filesToDelete.length - deleteErrors.length,
                            filesFailedToDelete: deleteErrors.length,
                            errors: deleteErrors
                        },
                        ipAddress: ipAddress,
                        userAgent: req.headers['user-agent'] || 'Unknown',
                        requestPath: `/api/invoice/${faktur}`,
                        requestMethod: 'DELETE',
                        statusCode: 500,
                        responseMessage: null,
                        errorMessage: 'Failed to delete invoice from database',
                        isSuspicious: false,
                        severity: 'error'
                    }).catch(() => {});
                    return res.status(500).json({ error: 'Failed to delete invoice from database' });
                }
                
                // ============================================================
                // PERBAIKAN (C5): bersihkan record invoice_files
                // ============================================================
                // Kalau dibiarkan, record invoice_files tetap ada sehingga
                // hitungan file (path ATAU invoice_files) menghitung file yang
                // sudah dihapus -> status invoice jadi tidak akurat (mis. 3/3
                // padahal 0 file) saat faktur yang sama diupload ulang.
                try {
                    await supabase
                        .from('invoice_files')
                        .delete()
                        .eq('faktur', faktur);
                } catch (filesCleanupErr) {
                    console.warn(`[Invoice API] Gagal bersihkan invoice_files untuk ${faktur}: ${filesCleanupErr.message}`);
                }
                
                const totalTime = Date.now() - startTime;
                console.log(`[Invoice API] ✓ Invoice ${faktur} deleted successfully in ${totalTime}ms`);
                
                // Log to audit trail with detailed information
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: req.user.userId,
                    userEmail: req.user.email,
                    userRole: req.user.role,
                    zonaId: invoice.zona_id,
                    action: 'Delete Invoice',
                    resourceType: 'invoice',
                    resourceId: faktur,
                    resourceName: faktur,
                    operation: 'DELETE',
                    details: {
                        filesDeleted: filesToDelete.length,
                        filesFailedToDelete: deleteErrors.length,
                        deletionErrors: deleteErrors.length > 0 ? deleteErrors : null,
                        invoiceAmount: invoice.amount || null,
                        invoiceStatus: invoice.status,
                        deletionTime: totalTime
                    },
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: `/api/invoice/${faktur}`,
                    requestMethod: 'DELETE',
                    statusCode: 200,
                    responseMessage: 'Invoice and files deleted successfully',
                    errorMessage: null,
                    isSuspicious: false,
                    severity: 'info'
                }).catch(() => {});
                
                res.json({ 
                    success: true,
                    message: `Invoice ${faktur} and ${filesToDelete.length} files deleted`,
                    filesDeleted: filesToDelete.length,
                    filesFailedToDelete: deleteErrors.length
                });
                
            } catch (error) {
                console.error('[Invoice API] Delete error:', error);
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: req.user?.userId || null,
                    userEmail: req.user?.email || null,
                    userRole: req.user?.role || null,
                    zonaId: null,
                    action: 'Delete Invoice - Server Error',
                    resourceType: 'invoice',
                    resourceId: req.params.faktur,
                    resourceName: req.params.faktur,
                    operation: 'DELETE',
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: `/api/invoice/${req.params.faktur}`,
                    requestMethod: 'DELETE',
                    statusCode: 500,
                    responseMessage: null,
                    errorMessage: error.message,
                    isSuspicious: false,
                    severity: 'error'
                }).catch(() => {});
                res.status(500).json({ error: 'Server error: ' + error.message });
            }
        }
    );
    
    // ============================================
    // DELETE /api/invoice/batch/:batchId
    // Delete all invoices from a batch upload
    // ============================================
    app.delete('/api/invoice/batch/:batchId',
        ...createAuth(['super_admin', 'moderator']),
        async (req, res) => {
            try {
                const { batchId } = req.params;
                const startTime = Date.now();
                
                // Get batch info first
                const { data: batch, error: batchError } = await supabase
                    .from('excel_upload_batches')
                    .select('*')
                    .eq('id', batchId)
                    .single();
                
                if (batchError || !batch) {
                    const { ipAddress } = AuditLogger.extractClientInfo(req);
                    await auditLogger.log({
                        userId: req.user?.userId || null,
                        userEmail: req.user?.email || null,
                        userRole: req.user?.role || null,
                        zonaId: null,
                        action: 'Delete Invoice Batch - Not Found',
                        resourceType: 'invoice_batch',
                        resourceId: batchId,
                        resourceName: batchId,
                        operation: 'DELETE',
                        ipAddress: ipAddress,
                        userAgent: req.headers['user-agent'] || 'Unknown',
                        requestPath: `/api/invoice/batch/${batchId}`,
                        requestMethod: 'DELETE',
                        statusCode: 404,
                        responseMessage: null,
                        errorMessage: 'Batch not found',
                        isSuspicious: false,
                        severity: 'warning'
                    }).catch(() => {});
                    return res.status(404).json({ error: 'Batch not found' });
                }
                
                // Count invoices in this batch
                const { count, error: countError } = await supabase
                    .from('invoice_file_list')
                    .select('*', { count: 'exact', head: true })
                    .eq('excel_batch_id', batchId);
                
                if (countError) {
                    console.error('[Invoice API] Count error:', countError);
                    const { ipAddress } = AuditLogger.extractClientInfo(req);
                    await auditLogger.log({
                        userId: req.user.userId,
                        userEmail: req.user.email,
                        userRole: req.user.role,
                        zonaId: null,
                        action: 'Delete Invoice Batch - Count Error',
                        resourceType: 'invoice_batch',
                        resourceId: batchId,
                        resourceName: batch.filename,
                        operation: 'DELETE',
                        ipAddress: ipAddress,
                        userAgent: req.headers['user-agent'] || 'Unknown',
                        requestPath: `/api/invoice/batch/${batchId}`,
                        requestMethod: 'DELETE',
                        statusCode: 500,
                        responseMessage: null,
                        errorMessage: 'Failed to count invoices in batch',
                        isSuspicious: false,
                        severity: 'error'
                    }).catch(() => {});
                    return res.status(500).json({ error: 'Failed to count invoices' });
                }
                
                // ============================================================
                // PERBAIKAN (C5): hapus invoice_files & file di storage
                // ============================================================
                // req.body.delete_files = true -> file PDF di R2 ikut dihapus
                // (dikonfirmasi user di UI). Tanpa ini, upload ulang Excel yang
                // sama akan kena "File sudah ada (Duplicate)" untuk semua baris.
                const deleteFiles = !!(req.body && (req.body.delete_files === true || req.body.delete_files === 'true'));
                
                // Ambil daftar invoice + path file-nya SEBELUM dihapus
                const { data: batchInvoices } = await supabase
                    .from('invoice_file_list')
                    .select('faktur, invoice_pdf_path, bukti_bayar_path, faktur_pajak_path, uploaded_file_path')
                    .eq('excel_batch_id', batchId);
                
                let storageFilesDeleted = 0;
                let storageFilesFailed = 0;
                
                if (deleteFiles && batchInvoices && batchInvoices.length > 0) {
                    for (const inv of batchInvoices) {
                        const paths = [
                            inv.invoice_pdf_path,
                            inv.bukti_bayar_path,
                            inv.faktur_pajak_path
                        ].filter(Boolean);
                        
                        for (const p of paths) {
                            try {
                                await R2Storage.deleteFile(p);
                                storageFilesDeleted++;
                            } catch (delErr) {
                                storageFilesFailed++;
                            }
                        }
                    }
                    console.log(`[Invoice API] Batch ${batchId}: ${storageFilesDeleted} file storage dihapus (${storageFilesFailed} gagal)`);
                }
                
                // Delete all invoices from this batch
                const { error: deleteError } = await supabase
                    .from('invoice_file_list')
                    .delete()
                    .eq('excel_batch_id', batchId);
                
                // Bersihkan record invoice_files milik batch ini
                if (batchInvoices && batchInvoices.length > 0) {
                    for (const inv of batchInvoices) {
                        try {
                            await supabase
                                .from('invoice_files')
                                .delete()
                                .eq('faktur', inv.faktur);
                        } catch (filesCleanupErr) {
                            console.warn(`[Invoice API] Gagal bersihkan invoice_files ${inv.faktur}: ${filesCleanupErr.message}`);
                        }
                    }
                }
                
                if (deleteError) {
                    console.error('[Invoice API] Batch delete error:', deleteError);
                    const { ipAddress } = AuditLogger.extractClientInfo(req);
                    await auditLogger.log({
                        userId: req.user.userId,
                        userEmail: req.user.email,
                        userRole: req.user.role,
                        zonaId: null,
                        action: 'Delete Invoice Batch - Deletion Failed',
                        resourceType: 'invoice_batch',
                        resourceId: batchId,
                        resourceName: batch.filename,
                        operation: 'DELETE',
                        details: {
                            invoiceCount: count,
                            batchStatus: batch.status
                        },
                        ipAddress: ipAddress,
                        userAgent: req.headers['user-agent'] || 'Unknown',
                        requestPath: `/api/invoice/batch/${batchId}`,
                        requestMethod: 'DELETE',
                        statusCode: 500,
                        responseMessage: null,
                        errorMessage: 'Failed to delete batch invoices',
                        isSuspicious: false,
                        severity: 'error'
                    }).catch(() => {});
                    return res.status(500).json({ error: 'Failed to delete batch invoices' });
                }
                
                // Update batch status
                await supabase
                    .from('excel_upload_batches')
                    .update({ 
                        status: 'deleted',
                        error_log: `Deleted by ${req.user.email} at ${new Date().toISOString()}`
                    })
                    .eq('id', batchId);
                
                const totalTime = Date.now() - startTime;
                console.log(`[Invoice API] ✓ Batch ${batchId} with ${count} invoices deleted successfully in ${totalTime}ms`);
                
                // Log to audit trail with detailed information
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: req.user.userId,
                    userEmail: req.user.email,
                    userRole: req.user.role,
                    zonaId: null,
                    action: 'Delete Invoice Batch',
                    resourceType: 'invoice_batch',
                    resourceId: batchId,
                    resourceName: batch.filename,
                    operation: 'DELETE',
                    details: {
                        invoicesDeleted: count,
                        batchStatus: batch.status,
                        uploadedAt: batch.created_at,
                        storageFilesDeleted: storageFilesDeleted,
                        storageFilesFailed: storageFilesFailed,
                        deletionTime: totalTime
                    },
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: `/api/invoice/batch/${batchId}`,
                    requestMethod: 'DELETE',
                    statusCode: 200,
                    responseMessage: 'Batch and invoices deleted successfully',
                    errorMessage: null,
                    isSuspicious: false,
                    severity: 'info'
                }).catch(() => {});
                
                res.json({ 
                    success: true,
                    deletedCount: count,
                    batchFilename: batch.filename,
                    storageFilesDeleted: storageFilesDeleted,
                    storageFilesFailed: storageFilesFailed
                });
                
            } catch (error) {
                console.error('[Invoice API] Batch delete error:', error);
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: req.user?.userId || null,
                    userEmail: req.user?.email || null,
                    userRole: req.user?.role || null,
                    zonaId: null,
                    action: 'Delete Invoice Batch - Server Error',
                    resourceType: 'invoice_batch',
                    resourceId: req.params.batchId,
                    resourceName: req.params.batchId,
                    operation: 'DELETE',
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: `/api/invoice/batch/${req.params.batchId}`,
                    requestMethod: 'DELETE',
                    statusCode: 500,
                    responseMessage: null,
                    errorMessage: error.message,
                    isSuspicious: false,
                    severity: 'error'
                }).catch(() => {});
                res.status(500).json({ error: 'Server error' });
            }
        }
    );
    
    // ============================================
    // PATCH /api/invoice/:faktur/status
    // Manually update invoice status
    // ============================================
    app.patch('/api/invoice/:faktur/status',
        ...createAuth(['super_admin', 'moderator']),
        async (req, res) => {
            try {
                const { faktur } = req.params;
                const { status } = req.body;
                
                const validStatuses = ['PENDING', 'UPLOADED', 'MISSING'];
                if (!validStatuses.includes(status)) {
                    return res.status(400).json({ 
                        error: 'Invalid status',
                        validStatuses
                    });
                }
                
                const { error } = await supabase
                    .from('invoice_file_list')
                    .update({ status })
                    .eq('faktur', faktur);
                
                if (error) {
                    console.error('[Invoice API] Status update error:', error);
                    return res.status(500).json({ error: 'Failed to update status' });
                }
                
                // Log to audit
                await supabase.from('audit_logs').insert({
                    user_id: req.user.id,
                    action: 'update_invoice_status',
                    context: `Changed status of ${faktur} to ${status}`
                });
                
                res.json({ success: true });
                
            } catch (error) {
                console.error('[Invoice API] Status update error:', error);
                res.status(500).json({ error: 'Server error' });
            }
        }
    );

    // ============================================
    // GET /api/invoice/check-faktur/:faktur
    // Check if faktur exists in daftar invoice
    // ============================================
    app.get('/api/invoice/check-faktur/:faktur',
        createAuth(),
        async (req, res) => {
            try {
                const { faktur } = req.params;
                
                if (!faktur) {
                    return res.status(400).json({ error: 'Faktur is required' });
                }
                
                const { data, error } = await supabase
                    .from('invoice_file_list')
                    .select('faktur, status, toko, tanggal, konsumen, total_jumlah_jual, uploaded_file_path, invoice_pdf_path, bukti_bayar_path, faktur_pajak_path, keterangan')
                    .eq('faktur', faktur)
                    .single();
                
                if (error && error.code !== 'PGRST116') {
                    console.error('[Invoice API] Check faktur error:', error);
                    return res.status(500).json({ error: 'Server error' });
                }
                
                // Return result: exists = true if found, false if not
                res.json({
                    exists: !!data,
                    faktur: faktur,
                    data: data || null
                });
                
            } catch (error) {
                console.error('[Invoice API] Check faktur error:', error);
                res.status(500).json({ error: 'Server error' });
            }
        }
    );

    // ============================================
    // POST /api/invoice/check-fakturs-batch
    // ============================================
    // PERF (Fase 2): validasi faktur untuk banyak file sekaligus.
    // Sebelumnya frontend memanggil GET /api/invoice/check-faktur/<faktur>
    // untuk SETIAP file -> untuk bulk 200 file = 200 request + 200 query DB.
    // Endpoint ini memakai .in('faktur', ...) per batch 100 -> 200 file = 2 query.
    // Response: { results: { <faktur>: { exists, data } } }
    // ============================================
    app.post('/api/invoice/check-fakturs-batch',
        createAuth(),
        async (req, res) => {
            try {
                const { fakturs } = req.body || {};

                if (!Array.isArray(fakturs) || fakturs.length === 0) {
                    return res.status(400).json({ error: 'fakturs harus berupa array dan tidak boleh kosong' });
                }

                if (fakturs.length > 1000) {
                    return res.status(400).json({ error: 'Maksimal 1000 faktur per request' });
                }

                // Bersihkan & unik
                const cleanFakturs = [...new Set(
                    fakturs
                        .filter(f => typeof f === 'string' || typeof f === 'number')
                        .map(f => String(f).trim())
                        .filter(f => f.length > 0)
                )];

                const results = {};
                cleanFakturs.forEach(f => { results[f] = { exists: false, data: null }; });

                const BATCH_SIZE = 100;
                const selectCols = 'faktur, status, toko, tanggal, konsumen, total_jumlah_jual, uploaded_file_path, invoice_pdf_path, bukti_bayar_path, faktur_pajak_path, keterangan';

                for (let i = 0; i < cleanFakturs.length; i += BATCH_SIZE) {
                    const batch = cleanFakturs.slice(i, i + BATCH_SIZE);

                    const { data, error } = await supabase
                        .from('invoice_file_list')
                        .select(selectCols)
                        .in('faktur', batch);

                    if (error) {
                        console.error('[Invoice API] Batch check faktur error:', error.message);
                        return res.status(500).json({ error: 'Server error' });
                    }

                    (data || []).forEach(row => {
                        results[row.faktur] = { exists: true, data: row };
                    });
                }

                res.json({
                    success: true,
                    total: cleanFakturs.length,
                    found: Object.values(results).filter(r => r.exists).length,
                    results: results
                });

            } catch (error) {
                console.error('[Invoice API] Batch check faktur error:', error);
                res.status(500).json({ error: 'Server error' });
            }
        }
    );

    // ============================================
    // GET /api/invoice/check-file/:faktur/:fileType
    // Check if file exists on remote storage
    // fileType: 'invoice', 'bukti_bayar', or 'faktur_pajak'
    // 
    // SIMPLIFIED STRATEGY 1 ONLY: Database-driven approach
    // 1. Check if database has file path (invoice_pdf_path, bukti_bayar_path, faktur_pajak_path)
    // 2. If path exists ? verify file really exists via R2Storage.checkFileExists()
    // 3. If file exists ? return exists: true
    // 4. If database path is NULL ? return exists: false with message about uploading via Moderator Dashboard
    // 
    // Users MUST upload files through Moderator Dashboard to populate paths
    // Then admin_zona sees them in their dashboard
    // ============================================
    app.get('/api/invoice/check-file/:faktur/:fileType',
        createAuth(['super_admin', 'moderator', 'user', 'admin_zona']),
        async (req, res) => {
            try {
                const { faktur, fileType } = req.params;
                
                if (!faktur || !fileType) {
                    return res.status(400).json({ error: 'Faktur and fileType are required' });
                }
                
                // Validate fileType
                const validTypes = ['invoice', 'bukti_bayar', 'faktur_pajak'];
                if (!validTypes.includes(fileType)) {
                    return res.status(400).json({ 
                        error: 'Invalid file type',
                        validTypes: validTypes
                    });
                }
                
                // Get invoice data - with PostgREST schema caching workaround
                // Try new columns first, fall back to old if they don't exist
                let invoice = null;
                let queryError = null;
                
                // Try NEW columns first (with all the new columns that were supposed to be added)
                const { data: newData, error: newError } = await supabase
                    .from('invoice_file_list')
                    .select('invoice_pdf_path, bukti_bayar_path, faktur_pajak_path, uploaded_file_path, status, keterangan, files_uploaded_count, files_required_count')
                    .eq('faktur', faktur)
                    .single();
                
                if (!newError && newData) {
                    invoice = newData;
                    console.log(`[Check File] Using NEW schema with separate file columns`);
                } else if (newError && newError.message.includes('does not exist')) {
                    // Fallback: use OLD schema (which ONLY has uploaded_file_path, no other file columns)
                    console.log(`[Check File] Schema mismatch detected, falling back to OLD schema`);
                    const { data: oldData, error: oldError } = await supabase
                        .from('invoice_file_list')
                        .select('uploaded_file_path, status, keterangan')
                        .eq('faktur', faktur)
                        .single();
                    
                    if (!oldError && oldData) {
                        invoice = oldData;
                        console.log(`[Check File] ? OLD schema query succeeded`);
                    } else {
                        console.log(`[Check File] ? OLD schema query failed:`, oldError?.message);
                        queryError = oldError;
                    }
                } else {
                    queryError = newError;
                }
                
                if (queryError || !invoice) {
                    return res.status(404).json({ error: `Invoice not found: ${faktur}` });
                }
                
                console.log(`[Check File] Request: faktur=${faktur}, fileType=${fileType}`);
                console.log(`[Check File] Invoice keterangan: ${invoice.keterangan}`);
                
                // Try to get file path from NEW invoice_files table first
                let dbFilePath = null;
                let fileExistsInNewTable = false;
                
                try {
                    const { data: fileRecord, error: fileError } = await supabase
                        .from('invoice_files')
                        .select('file_path')
                        .eq('faktur', faktur)
                        .eq('file_type', fileType)
                        .single();
                    
                    if (!fileError && fileRecord) {
                        dbFilePath = fileRecord.file_path;
                        fileExistsInNewTable = true;
                        console.log(`[Check File] ? Found in invoice_files table: ${fileType}`);
                    }
                } catch (tableErr) {
                    console.log(`[Check File] invoice_files table not available`);
                }
                
                // Fallback: OLD method - check uploaded_file_path column
                if (!fileExistsInNewTable) {
                    if (fileType === 'invoice') {
                        dbFilePath = invoice.invoice_pdf_path || invoice.uploaded_file_path;
                    } else if (fileType === 'bukti_bayar') {
                        dbFilePath = invoice.bukti_bayar_path;
                    } else if (fileType === 'faktur_pajak') {
                        dbFilePath = invoice.faktur_pajak_path;
                    }
                }
                
                let fileExists = false;
                
                // FIRST: Try to use database path directly (most reliable, includes full filename)
                if (dbFilePath) {
                    try {
                        const exists = await R2Storage.checkFileExistsNoCache(dbFilePath);
                        if (exists) {
                            fileExists = true;
                            console.log(`[Check File] ? Found ${fileType} via DB path: ${dbFilePath}`);
                        }
                    } catch (err) {
                        console.log(`[Check File] DB path check failed, will try folder scan`);
                    }
                }
                
                // FALLBACK: Scan R2 directly for file if not found via DB path
                if (!fileExists) {
                    const { data: invoiceForDate, error: dateErr } = await supabase
                        .from('invoice_file_list')
                        .select('tanggal, toko')
                        .eq('faktur', faktur)
                        .single();
                    
                    if (!dateErr && invoiceForDate && invoiceForDate.tanggal) {
                        const year = invoiceForDate.tanggal.split('-')[0];
                        const monthNum = String(invoiceForDate.tanggal.split('-')[1]).padStart(2, '0');
                        const day = String(invoiceForDate.tanggal.split('-')[2]).padStart(2, '0');
                        
                        // Nama bulan: upload memakai konvensi Indonesia, file lama
                        // bisa memakai konvensi Inggris -> coba keduanya.
                        const monthVariants = R2Storage.monthNameVariants(monthNum);
                        const location = invoiceForDate.toko ? (invoiceForDate.toko.includes('PEMALANG') ? 'PEMALANG' : 'BEKASI') : 'BEKASI';
                        
                        const filename = `${faktur}.pdf`;
                        
                        // Build paths for the requested file type
                        let pathsToCheck = [];
                        for (const monthName of monthVariants) {
                            if (fileType === 'invoice') {
                                pathsToCheck.push(
                                    `ARSIP/${location}/PPN/${year}/${monthName}/${day}/${filename}`,
                                    `ARSIP/${location}/NON/${year}/${monthName}/${day}/${filename}`
                                );
                            } else if (fileType === 'bukti_bayar') {
                                pathsToCheck.push(
                                    `ARSIP/${location}/bukti-bayar/${year}/${monthName}/${day}/${filename}`
                                );
                            } else if (fileType === 'faktur_pajak') {
                                // For faktur pajak, also try with "tax-" prefix and different case variations
                                pathsToCheck.push(
                                    `ARSIP/${location}/faktur-pajak/${year}/${monthName}/${day}/${filename}`,
                                    `ARSIP/${location}/Faktur-Pajak/${year}/${monthName}/${day}/${filename}`,
                                    `ARSIP/${location}/faktur-pajak/${year}/${monthName}/${day}/tax-${faktur}`,  // partial match for files with extra text
                                    `ARSIP/${location}/Faktur-Pajak/${year}/${monthName}/${day}/tax-${faktur}`
                                );
                            }
                        }
                        
                        // Check each possible path
                        for (const path of pathsToCheck) {
                            try {
                                const exists = await R2Storage.checkFileExistsNoCache(path);
                                if (exists) {
                                    fileExists = true;
                                    dbFilePath = path;
                                    console.log(`[Check File] ? Found ${fileType}: ${path}`);
                                    break;
                                }
                            } catch (err) {
                                // Continue checking
                            }
                        }
                    }
                }
                
                if (!fileExists) {
                    console.log(`[Check File] File not found in R2 for ${fileType}`);
                }

                // ============================================================
                // PERF (fix N+1): hitung jumlah file dari DATABASE
                // ============================================================
                // SEBELUMNYA: setiap panggilan check-file menjalankan
                // updateFilesUploadedCount() = scan R2 (sampai 15x HeadObject)
                // + UPDATE files_uploaded_count. Endpoint ini dipanggil per file
                // saat upload, jadi sangat berat dan membebani R2 + database.
                // SEKARANG: cukup 1 COUNT dari tabel invoice_files + nilai
                // files_uploaded_count yang sudah di-maintain oleh upload flow
                // dan trigger database (CREATE_TRIGGER_FUNCTION.sql).
                // Perilaku 'exists' (cek file di R2) TIDAK berubah.
                let filesUploaded = invoice.files_uploaded_count || 0;
                try {
                    const { count: fileRows, error: countErr } = await supabase
                        .from('invoice_files')
                        .select('*', { count: 'exact', head: true })
                        .eq('faktur', faktur);
                    if (!countErr && typeof fileRows === 'number') {
                        filesUploaded = Math.max(filesUploaded, fileRows);
                    }
                } catch (countErr) {
                    // abaikan - pakai nilai files_uploaded_count dari DB
                }
                if (!filesUploaded) {
                    // Fallback: hitung dari kolom path (legacy schema)
                    const pathCount = [
                        invoice.invoice_pdf_path,
                        invoice.bukti_bayar_path,
                        invoice.faktur_pajak_path
                    ].filter(Boolean).length;
                    filesUploaded = pathCount;
                }
                
                const isPPN = invoice.keterangan && invoice.keterangan.toUpperCase() === 'PPN';
                const requiredCount = isPPN ? 3 : 2;

                res.json({
                    exists: fileExists,
                    faktur: faktur,
                    fileType: fileType,
                    filePath: dbFilePath || null,
                    fileCount: {
                        uploaded: filesUploaded,
                        required: requiredCount,
                        status: `${filesUploaded}/${requiredCount}`
                    },
                    message: fileExists ? 'File exists' : 'File not found'
                });
                
            } catch (error) {
                console.error('[Invoice API] Check file error:', error);
                res.status(500).json({ error: 'Server error' });
            }
        }
    );

    // ============================================
    // POST /api/invoice/verify-file-count/:faktur
    // Manually verify and correct files_uploaded_count
    // Compares DB count vs actual file paths
    // Auto-corrects if mismatch found
    // ============================================
    app.post('/api/invoice/verify-file-count/:faktur',
        createAuth(['super_admin', 'moderator']),
        async (req, res) => {
            try {
                const { faktur } = req.params;
                
                if (!faktur) {
                    return res.status(400).json({ error: 'Faktur is required' });
                }
                
                // Get current invoice data - with schema fallback
                let invoice = null;
                let queryErr = null;
                
                // Try NEW schema first
                const { data: newData, error: newError } = await supabase
                    .from('invoice_file_list')
                    .select('invoice_pdf_path, bukti_bayar_path, faktur_pajak_path, files_uploaded_count, files_required_count, keterangan')
                    .eq('faktur', faktur)
                    .single();
                
                if (!newError && newData) {
                    invoice = newData;
                } else if (newError && newError.message.includes('does not exist')) {
                    // Fallback: use OLD schema (which ONLY has uploaded_file_path, status, keterangan)
                    const { data: oldData, error: oldError } = await supabase
                        .from('invoice_file_list')
                        .select('uploaded_file_path, keterangan')
                        .eq('faktur', faktur)
                        .single();
                    
                    if (!oldError && oldData) {
                        invoice = oldData;
                    } else {
                        queryErr = oldError;
                    }
                } else {
                    queryErr = newError;
                }
                
                if (queryErr || !invoice) {
                    return res.status(404).json({ error: `Invoice not found: ${faktur}` });
                }
                
                // Calculate actual count from paths - handle both schemas
                let actualCount = 0;
                
                // NEW schema: check the three separate columns
                if (invoice.invoice_pdf_path) actualCount++;
                if (invoice.bukti_bayar_path) actualCount++;
                
                const isPPN = invoice.keterangan && invoice.keterangan.toUpperCase() === 'PPN';
                if (isPPN && invoice.faktur_pajak_path) actualCount++;
                
                // OLD schema fallback
                if (actualCount === 0 && invoice.uploaded_file_path) {
                    actualCount = 1;
                }
                
                const dbCount = invoice.files_uploaded_count || 0;
                const requiredCount = invoice.files_required_count || (isPPN ? 3 : 2);
                const isMismatch = dbCount !== actualCount;
                
                // If mismatch, correct it
                let correctedCount = actualCount;
                if (isMismatch) {
                    console.log(`[Verify Count] Correcting ${faktur}: ${dbCount} ? ${actualCount}`);
                    const corrected = await updateFilesUploadedCount(supabase, faktur, R2Storage);
                    correctedCount = corrected || actualCount;
                }
                
                res.json({
                    faktur: faktur,
                    previousCount: dbCount,
                    actualCount: actualCount,
                    currentCount: correctedCount,
                    wasMismatch: isMismatch,
                    wasCorrected: isMismatch,
                    requiredCount: invoice.files_required_count || (invoice.keterangan === 'PPN' ? 3 : 2)
                });
                
            } catch (error) {
                console.error('[Invoice API] Verify count error:', error);
                res.status(500).json({ error: 'Server error' });
            }
        }
    );

    // ============================================
    // GET /api/invoice/sync-stats
    // Get file count sync job statistics
    // Admin only
    // ============================================
    app.get('/api/invoice/sync-stats',
        createAuth(['super_admin', 'moderator']),
        async (req, res) => {
            try {
                // Get sync job statistics
                const { getSyncStats } = require('../backend/file-count-sync-job');
                const stats = getSyncStats();

                res.json({
                    success: true,
                    stats: {
                        lastRun: stats.lastRun,
                        totalChecked: stats.totalChecked,
                        totalCorrected: stats.totalCorrected,
                        errorCount: stats.errors.length,
                        recentErrors: stats.errors.slice(0, 10),
                        lastError: stats.lastError
                    },
                    description: 'Background file count verification statistics'
                });

            } catch (error) {
                console.error('[Invoice API] Sync stats error:', error);
                res.status(500).json({ error: 'Server error' });
            }
        }
    );

    // ============================================
    // GET /api/invoice/count-discrepancies
    // List invoices with files_uploaded_count mismatches
    // Admin only - for monitoring/debugging
    // ============================================
    app.get('/api/invoice/count-discrepancies',
        createAuth(['super_admin', 'moderator']),
        async (req, res) => {
            try {
                const limit = Math.min(parseInt(req.query.limit) || 50, 100);

                // Get invoices with potential mismatches
                // Try NEW schema first with separate file columns
                let invoices;
                let queryErr;
                
                const { data: newData, error: newError } = await supabase
                    .from('invoice_file_list')
                    .select('faktur, invoice_pdf_path, bukti_bayar_path, faktur_pajak_path, files_uploaded_count, files_required_count, keterangan, updated_at')
                    .order('updated_at', { ascending: false })
                    .limit(limit);

                if (!newError && newData) {
                    invoices = newData;
                } else if (newError && newError.message.includes('does not exist')) {
                    // Fallback: OLD schema only has uploaded_file_path (not the separate columns)
                    const { data: oldData, error: oldError } = await supabase
                        .from('invoice_file_list')
                        .select('faktur, uploaded_file_path, keterangan, updated_at')
                        .order('updated_at', { ascending: false })
                        .limit(limit);
                    
                    invoices = oldData;
                    queryErr = oldError;
                } else {
                    queryErr = newError;
                }

                if (queryErr) {
                    console.error('[Invoice API] Query error:', queryErr);
                    return res.status(500).json({ error: 'Query failed' });
                }

                // Analyze each for discrepancies
                const discrepancies = [];

                invoices.forEach(inv => {
                    // Count actual paths
                    let actualCount = 0;
                    if (inv.invoice_pdf_path) actualCount++;
                    if (inv.bukti_bayar_path) actualCount++;
                    if (inv.faktur_pajak_path) actualCount++;
                    
                    // OLD schema fallback: if no new columns, check uploaded_file_path
                    if (actualCount === 0 && inv.uploaded_file_path) {
                        actualCount = 1;
                    }

                    const dbCount = inv.files_uploaded_count || 0;
                    const requiredCount = inv.files_required_count || (inv.keterangan === 'PPN' ? 3 : 2);

                    // Flag mismatches
                    if (dbCount !== actualCount) {
                        discrepancies.push({
                            faktur: inv.faktur,
                            dbCount: dbCount,
                            actualCount: actualCount,
                            requiredCount: requiredCount,
                            status: actualCount === requiredCount ? 'complete' : 'incomplete',
                            mismatch: true,
                            lastUpdated: inv.updated_at,
                            missingFiles: []
                                .concat(!inv.invoice_pdf_path && !inv.uploaded_file_path ? ['invoice'] : [])
                                .concat(!inv.bukti_bayar_path ? ['bukti_bayar'] : [])
                                .concat(inv.keterangan === 'PPN' && !inv.faktur_pajak_path ? ['faktur_pajak'] : [])
                        });
                    }
                });

                res.json({
                    success: true,
                    totalChecked: invoices.length,
                    discrepancyCount: discrepancies.length,
                    discrepancies: discrepancies,
                    description: 'Invoices with files_uploaded_count mismatches'
                });

            } catch (error) {
                console.error('[Invoice API] Count discrepancies error:', error);
                res.status(500).json({ error: 'Server error' });
            }
        }
    );
    // Clear all test invoice data (for development/testing only)
    // ============================================
    app.delete('/api/invoice/clear-test-data',
        createAuth(['super_admin']),
        async (req, res) => {
            try {
                console.log(`[Invoice API] Clearing test data by ${req.user?.name}`);
                
                // Delete all invoices that were uploaded via Excel
                const { data: deleted, error: deleteError } = await supabase
                    .from('invoice_file_list')
                    .delete()
                    .not('excel_batch_id', 'is', null)
                    .select('id');
                
                if (deleteError) {
                    console.error('[Invoice API] Clear test data error:', deleteError);
                    return res.status(500).json({ error: 'Failed to clear data' });
                }
                
                const deletedCount = deleted?.length || 0;
                console.log(`[Invoice API] Deleted ${deletedCount} test invoices`);
                
                // Also clear batch records
                const { error: batchDeleteError } = await supabase
                    .from('excel_upload_batches')
                    .delete()
                    .neq('id', '');
                
                if (batchDeleteError) {
                    console.warn('[Invoice API] Failed to clear batch records:', batchDeleteError);
                }
                
                // Log activity
                await supabase.from('activity_logs').insert({
                    user_id: req.user.id,
                    action: 'clear_test_data',
                    context: `Cleared ${deletedCount} test invoice records`
                });
                
                res.json({ 
                    success: true, 
                    message: `Cleared ${deletedCount} test invoices`
                });
                
            } catch (error) {
                console.error('[Invoice API] Clear test data error:', error);
                res.status(500).json({ error: 'Server error' });
            }
        }
    );
    
    // ============================================
    // POST /api/invoice/upload-pdf
    // Upload PDF and mark invoice as UPLOADED by matching faktur in filename
    // Filename format: 835100310.pdf or similar
    // ============================================
    // ============================================
    // POST /api/invoice/upload-pdf
    // Upload Invoice PDF (1 file per request)
    // ============================================
    // PERBAIKAN (B1/B2 + Fase 1 + Fase 2):
    //  - Upload TIDAK lagi fire-and-forget (setImmediate). Request menunggu
    //    upload selesai => user tahu file benar-benar masuk, dan tidak ada
    //    buffer menumpuk di RAM untuk bulk 200+ file.
    //  - Upload melewati queue dengan batas konkurensi.
    //  - Path target dihitung dengan fungsi yang SAMA dengan penulisan ke R2
    //    -> cek duplikat selalu akurat.
    //  - Kalau upload gagal, kolom path TIDAK pernah ditulis NULL dan
    //    files_uploaded_count tidak ikut turun.
    //  - Count file disinkronkan dari database (tidak scan R2).
    app.post('/api/invoice/upload-pdf',
        ...createAuth(['super_admin', 'moderator', 'user']),
        uploadGate,
        upload.single('pdf'),
        handleMulterError,
        async (req, res) => {
            try {
                if (!req.file) {
                    return res.status(400).json({ error: 'No PDF file provided' });
                }

                const filename = req.file.originalname;
                const fileBuffer = req.file.buffer;

                // Validasi isi file (magic bytes) - cegah file non-PDF
                if (!isPdfBuffer(fileBuffer)) {
                    logSecurityEvent('[FILE_UPLOAD]', 'Invalid PDF file rejected', {
                        userId: req.user?.id,
                        fileName: filename,
                        size: fileBuffer.length
                    });
                    return res.status(400).json({ error: 'File tidak valid: konten file bukan PDF.' });
                }

                // Extract faktur from filename (remove .pdf extension)
                const faktur = path.parse(filename).name; // 835100310.pdf -> 835100310
                if (!faktur) {
                    return res.status(400).json({ error: 'Cannot extract faktur from filename' });
                }

                // Check if invoice exists
                const { data: invoice, error: queryError } = await supabase
                    .from('invoice_file_list')
                    .select('*')
                    .eq('faktur', faktur)
                    .single();

                if (queryError || !invoice) {
                    return res.status(404).json({ error: `Invoice not found for faktur: ${faktur}` });
                }

                // AUTO-FIX: If zona_id is missing, populate it from toko
                if (!invoice.zona_id && invoice.toko) {
                    try {
                        const { data: tokoData } = await supabase
                            .from('toko')
                            .select('zona_id')
                            .eq('nama', invoice.toko)
                            .maybeSingle();

                        if (tokoData && tokoData.zona_id) {
                            const { error: updateError } = await supabase
                                .from('invoice_file_list')
                                .update({ zona_id: tokoData.zona_id })
                                .eq('faktur', faktur);

                            if (!updateError) {
                                invoice.zona_id = tokoData.zona_id;
                            }
                        }
                    } catch (autoFixErr) {
                        // Don't block upload, just log warning
                        console.warn(`[Invoice PDF] Auto-populate zona_id failed:`, autoFixErr.message);
                    }
                }

                // SAFEGUARD: tanggal wajib ada (dipakai untuk path storage)
                if (!invoice.tanggal) {
                    return res.status(400).json({ error: 'Invoice tanggal tidak ditemukan' });
                }

                const location = extractLocationFromToko(invoice.toko);
                const target = buildTargetPath('invoice', { invoice, filename, location });

                // ============================================================
                // Aturan duplikat seragam untuk 3 tipe upload
                // ============================================================
                const overwrite = String(req.body?.overwrite || '').toLowerCase() === 'true';
                const dup = await checkDuplicateState({
                    type: 'invoice',
                    invoice,
                    targetPath: target.storagePath,
                    overwrite,
                    R2Storage
                });

                if (dup.action === 'reject') {
                    return res.status(409).json({
                        error: 'File sudah ada (Duplicate)',
                        message: `Invoice PDF untuk faktur ${faktur} sudah ada di storage. Hapus file lama terlebih dahulu bila ingin menggantinya.`,
                        existing_path: dup.existingPath,
                        faktur: faktur
                    });
                }

                // File orphan: sudah ada di R2 tapi database tidak tahu
                // -> adot path-nya, tidak perlu upload ulang (menyembuhkan data)
                if (dup.action === 'adopt') {
                    const persist = await persistInvoiceFile({
                        supabase, faktur, type: 'invoice', filePath: target.storagePath, userId: req.user.id
                    });
                    const countInfo = await syncInvoiceFileCount({ supabase, faktur, type: 'invoice' });

                    return res.json({
                        success: true,
                        message: 'File sudah ada di storage, path diperbaiki di database (tidak diupload ulang)',
                        faktur,
                        status: 'completed',
                        adopted: true,
                        storagePath: target.storagePath,
                        files_uploaded_count: countInfo?.count,
                        files_required_count: countInfo?.required,
                        dbUpdated: persist.ok,
                        // WhatsApp data
                        konsumen: invoice.konsumen,
                        total_jumlah_jual: invoice.total_jumlah_jual,
                        zona_id: invoice.zona_id,
                        tipe: invoice.keterangan || 'PPN',
                        nominal: invoice.total_jumlah_jual
                    });
                }

                // ============================================================
                // Upload ke R2 - lewat queue, request MENUNGGU sampai selesai
                // ============================================================
                let uploadResult;
                try {
                    uploadResult = await uploadQueue.run(() => R2Storage.uploadInvoicePDF(
                        fileBuffer,
                        filename,
                        target.year,
                        target.monthName,
                        target.day,
                        target.category,
                        target.location
                    ));
                } catch (uploadErr) {
                    if (uploadErr.code === 'DUPLICATE_FILE') {
                        return res.status(409).json({
                            error: 'File sudah ada (Duplicate)',
                            message: `Invoice PDF untuk faktur ${faktur} sudah ada di storage.`,
                            existing_path: target.storagePath,
                            faktur: faktur
                        });
                    }
                    console.error('[Invoice PDF] Upload R2 gagal:', uploadErr.message);
                    return res.status(500).json({
                        error: 'Upload ke storage gagal',
                        message: uploadErr.message,
                        faktur: faktur
                    });
                }

                // ============================================================
                // Simpan ke database (tidak pernah menulis NULL ke kolom path)
                // ============================================================
                const persist = await persistInvoiceFile({
                    supabase, faktur, type: 'invoice', filePath: uploadResult.storagePath, userId: req.user.id
                });
                const countInfo = await syncInvoiceFileCount({ supabase, faktur, type: 'invoice' });

                if (!persist.ok) {
                    console.error(`[Invoice PDF] DB update belum lengkap untuk ${faktur}:`, persist.error);
                }

                res.json({
                    success: true,
                    message: 'Invoice PDF berhasil diupload',
                    faktur,
                    status: 'completed',
                    storagePath: uploadResult.storagePath,
                    files_uploaded_count: countInfo?.count ?? invoice.files_uploaded_count,
                    files_required_count: countInfo?.required,
                    dbUpdated: persist.ok,
                    // WhatsApp data
                    konsumen: invoice.konsumen,
                    total_jumlah_jual: invoice.total_jumlah_jual,
                    zona_id: invoice.zona_id,
                    tipe: invoice.keterangan || 'PPN',
                    nominal: invoice.total_jumlah_jual
                });

            } catch (error) {
                console.error('[Invoice PDF] Upload error:', error);
                res.status(500).json({ error: 'Server error', details: error.message });
            }
        }
    );

    // ============================================
    // POST /api/invoice/upload-document
    // Unified endpoint for both Bukti Bayar and Faktur Pajak
    // Body: { type: 'bukti_bayar' | 'faktur_pajak' }
    // ============================================
    // ============================================
    // POST /api/invoice/upload-document
    // Unified endpoint for both Bukti Bayar and Faktur Pajak
    // Body: { type: 'bukti_bayar' | 'faktur_pajak' }
    // ============================================
    // PERBAIKAN (B1/B2 + Fase 1 + Fase 2):
    //  - Menunggu upload selesai (tidak fire-and-forget).
    //  - Aturan duplikat seragam + path target identik dengan path di R2.
    //  - Path TIDAK PERNAH ditulis NULL saat upload gagal.
    //  - Count file disinkronkan dari database (tidak scan R2).
    const handleUploadDocument = async (req, res, forcedType) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'File PDF wajib diupload' });
            }

            // Security Check 1: File size validation (10MB max per file)
            if (req.file.size > 10 * 1024 * 1024) {
                return res.status(413).json({
                    error: 'File terlalu besar',
                    message: 'Maksimal ukuran file: 10MB',
                    received: `${(req.file.size / 1024 / 1024).toFixed(2)}MB`
                });
            }

            // Security Check 2: isi file harus PDF asli (magic bytes)
            if (!isPdfBuffer(req.file.buffer)) {
                logSecurityEvent('[FILE_UPLOAD]', 'Invalid PDF file rejected', {
                    userId: req.user?.id,
                    fileName: req.file.originalname,
                    size: req.file.size
                });
                return res.status(400).json({
                    error: 'Tipe file tidak diizinkan',
                    message: 'Hanya file PDF yang diterima'
                });
            }

            const fileBuffer = req.file.buffer;
            const filename = req.file.originalname;
            const fileType = forcedType || req.body.type || 'bukti_bayar';
            const userId = req.user?.id;

            if (!['bukti_bayar', 'faktur_pajak'].includes(fileType)) {
                return res.status(400).json({ success: false, error: 'Tipe file tidak valid' });
            }

            const typeCfg = getTypeConfig(fileType);

            // ---- Ambil nomor faktur dari nama file ----
            let fakturNumber;
            let cleanFilename;

            if (fileType === 'faktur_pajak') {
                // Handle double .pdf extension
                cleanFilename = filename.replace(/\.pdf\.pdf$/i, '.pdf');

                const numberMatches = cleanFilename.match(/\d{10,}/g);
                fakturNumber = numberMatches ? numberMatches[0] : null;

                // If no 10+ digit match found, try shorter numbers
                if (!fakturNumber) {
                    const shortMatch = cleanFilename.match(/(\d+)/);
                    fakturNumber = shortMatch ? shortMatch[1] : null;
                }

                if (!fakturNumber) {
                    return res.status(400).json({
                        success: false,
                        error: 'ERROR : Format Nama File Tidak Sesuai - Tidak dapat menemukan nomor faktur'
                    });
                }
            } else {
                // Bukti bayar: nama file harus nomor faktur
                fakturNumber = filename.replace(/\.pdf\.pdf$/i, '.pdf').replace(/\.pdf$/i, '').trim();

                if (!/^\d+$/.test(fakturNumber)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Nama file harus berupa nomor faktur'
                    });
                }

                cleanFilename = `${fakturNumber}.pdf`;
            }

            // ---- Data invoice (tanggal, toko, path file sebelumnya) ----
            const { data: invoice } = await supabase
                .from('invoice_file_list')
                .select('tanggal, toko, keterangan, zona_id, konsumen, total_jumlah_jual, invoice_pdf_path, bukti_bayar_path, faktur_pajak_path')
                .eq('faktur', fakturNumber)
                .maybeSingle();

            if (!invoice) {
                console.warn(`[Invoice Document] Invoice not found for faktur: ${fakturNumber}, using today's date`);
            }

            const location = extractLocationFromToko(invoice?.toko);
            const target = buildTargetPath(fileType, { invoice, filename: cleanFilename, location });

            // ============================================================
            // Aturan duplikat seragam
            // ============================================================
            const overwrite = String(req.body?.overwrite || '').toLowerCase() === 'true';
            const dup = await checkDuplicateState({
                type: fileType,
                invoice,
                targetPath: target.storagePath,
                overwrite,
                R2Storage
            });

            if (dup.action === 'reject') {
                return res.status(409).json({
                    error: 'File sudah ada (Duplicate)',
                    message: `${typeCfg.label} untuk faktur ${fakturNumber} sudah ada di storage. Hapus file lama terlebih dahulu bila ingin menggantinya.`,
                    existing_path: dup.existingPath,
                    faktur: fakturNumber
                });
            }

            // File orphan (ada di R2, tidak ada di DB) -> adopt path
            if (dup.action === 'adopt') {
                const persist = await persistInvoiceFile({
                    supabase, faktur: fakturNumber, type: fileType, filePath: target.storagePath, userId
                });
                const countInfo = await syncInvoiceFileCount({ supabase, faktur: fakturNumber, type: fileType });

                return res.json({
                    success: true,
                    message: 'File sudah ada di storage, path diperbaiki di database (tidak diupload ulang)',
                    type: fileType,
                    originalName: filename,
                    status: 'completed',
                    adopted: true,
                    faktur: fakturNumber,
                    storagePath: target.storagePath,
                    files_uploaded_count: countInfo?.count,
                    files_required_count: countInfo?.required,
                    dbUpdated: persist.ok
                });
            }

            // ============================================================
            // Upload ke R2 - lewat queue, request menunggu selesai
            // ============================================================
            let uploadResult;
            try {
                uploadResult = await uploadQueue.run(() => R2Storage.uploadDocumentFile(
                    fileBuffer,
                    cleanFilename,
                    target.year,
                    target.monthName,
                    target.day,
                    target.folder,
                    target.location
                ));
            } catch (uploadErr) {
                if (uploadErr.code === 'DUPLICATE_FILE') {
                    return res.status(409).json({
                        error: 'File sudah ada (Duplicate)',
                        message: `${typeCfg.label} untuk faktur ${fakturNumber} sudah ada di storage.`,
                        existing_path: target.storagePath,
                        faktur: fakturNumber
                    });
                }
                console.error('[Invoice Document] Upload R2 gagal:', uploadErr.message);
                return res.status(500).json({
                    success: false,
                    error: 'Upload ke storage gagal: ' + uploadErr.message,
                    faktur: fakturNumber
                });
            }

            // ============================================================
            // Simpan ke database
            // ============================================================
            const persist = await persistInvoiceFile({
                supabase, faktur: fakturNumber, type: fileType, filePath: uploadResult.storagePath, userId
            });
            const countInfo = await syncInvoiceFileCount({ supabase, faktur: fakturNumber, type: fileType });

            if (!persist.ok) {
                console.error(`[Invoice Document] DB update belum lengkap untuk ${fakturNumber}:`, persist.error);
            }

            res.json({
                success: true,
                message: `${typeCfg.label} uploaded successfully`,
                type: fileType,
                originalName: filename,
                status: 'completed',
                faktur: fakturNumber,
                storagePath: uploadResult.storagePath,
                files_uploaded_count: countInfo?.count,
                files_required_count: countInfo?.required,
                dbUpdated: persist.ok
            });

        } catch (error) {
            console.error('[Invoice Document] Error:', error.message);
            res.status(500).json({
                success: false,
                error: 'Server error: ' + error.message
            });
        }
    };

    app.post('/api/invoice/upload-document',
        ...createAuth(['super_admin', 'moderator']),
        uploadGate,
        upload.single('file'),
        handleMulterError,
        (req, res) => handleUploadDocument(req, res, null)
    );

    // ============================================
    // POST /api/invoice/upload-faktur-pajak
    // ============================================
    // Route lama (belum pernah dipakai UI). Sempat rusak: membaca
    // uploadResult.success / .path padahal R2Storage.uploadDocumentFile
    // return { storagePath } -> selalu dianggap gagal padahal file sudah
    // masuk R2, sehingga path tidak pernah tercatat di database.
    // Sekarang route ini memakai handler yang sama dengan /upload-document
    // sehingga hanya ada SATU implementasi upload faktur pajak.
    app.post('/api/invoice/upload-faktur-pajak',
        ...createAuth(['super_admin', 'moderator']),
        uploadGate,
        upload.single('file'),
        handleMulterError,
        (req, res) => {
            // Format nama file: tax-REFERENSI NAMA NOMINAL.pdf
            const filename = req.file?.originalname || '';
            if (!/^tax-(.+)\.pdf$/i.test(filename)) {
                return res.status(400).json({
                    success: false,
                    error: 'Format nama file tidak sesuai. Harus: tax-REFERENSI NAMA NOMINAL.pdf',
                    example: 'tax-835100310232 SEMESTA GEMILANG CILEGON 2.393.000.pdf'
                });
            }
            return handleUploadDocument(req, res, 'faktur_pajak');
        }
    );
    
    // ============================================
    // GET /api/invoice/download-file/:faktur/:fileType
    // Download individual file (invoice, bukti_bayar, or faktur_pajak)
    // OPTIMIZED: Caches downloads locally to avoid repeated rclone calls
    // First download: 6-7s (rclone), Subsequent: <100ms (cache hit)
    // ============================================
    app.get('/api/invoice/download-file/:faktur/:fileType',
        ...createAuth(['super_admin', 'moderator', 'user', 'admin_zona']),
        async (req, res) => {
            try {
                const { faktur, fileType } = req.params;
                const startTime = Date.now();
                
                console.log(`[Invoice Download] Request for ${fileType} of faktur: ${faktur}`);
                
                // Validate fileType
                const validTypes = ['invoice', 'bukti_bayar', 'faktur_pajak'];
                if (!validTypes.includes(fileType)) {
                    return res.status(400).json({ 
                        error: 'Invalid file type',
                        validTypes: validTypes
                    });
                }
                
                // Get invoice data (optimized: select only needed columns)
                const queryStartTime = Date.now();
                const { data: invoice, error: queryError } = await supabase
                    .from('invoice_file_list')
                    .select('zona_id, invoice_pdf_path, bukti_bayar_path, faktur_pajak_path, uploaded_file_path')
                    .eq('faktur', faktur)
                    .single();
                
                const queryTime = Date.now() - queryStartTime;
                console.log(`[Invoice Download] DB query took ${queryTime}ms`);
                
                if (queryError || !invoice) {
                    const { ipAddress } = AuditLogger.extractClientInfo(req);
                    await auditLogger.log({
                        userId: req.user?.userId || null,
                        userEmail: req.user?.email || null,
                        userRole: req.user?.role || null,
                        zonaId: null,
                        action: 'Download Invoice - Not Found',
                        resourceType: 'invoice_file',
                        resourceId: faktur,
                        resourceName: faktur,
                        operation: 'READ',
                        ipAddress: ipAddress,
                        userAgent: req.headers['user-agent'] || 'Unknown',
                        requestPath: `/api/invoice/download-file/${faktur}/${fileType}`,
                        requestMethod: 'GET',
                        statusCode: 404,
                        responseMessage: null,
                        errorMessage: 'Invoice not found',
                        isSuspicious: false,
                        severity: 'warning'
                    }).catch(() => {});
                    return res.status(404).json({ error: `Invoice not found: ${faktur}` });
                }

                // SECURITY: Verifikasi user boleh akses invoice ini berdasarkan zona_id
                if (!enforceZoneOwnership(req, res, invoice.zona_id)) return;
                
                // Get file path based on type
                let filePath = null;
                
                // Use the correct path column based on file type
                if (fileType === 'invoice') {
                    filePath = invoice.invoice_pdf_path;
                } else if (fileType === 'bukti_bayar') {
                    filePath = invoice.bukti_bayar_path;
                } else if (fileType === 'faktur_pajak') {
                    filePath = invoice.faktur_pajak_path;
                }
                
                // Fallback to uploaded_file_path if specific path not found
                if (!filePath) {
                    filePath = invoice.uploaded_file_path;
                }
                
                if (!filePath) {
                    const { ipAddress } = AuditLogger.extractClientInfo(req);
                    await auditLogger.log({
                        userId: req.user.userId,
                        userEmail: req.user.email,
                        userRole: req.user.role,
                        zonaId: invoice.zona_id,
                        action: `Download ${fileType} - File Not Uploaded`,
                        resourceType: 'invoice_file',
                        resourceId: faktur,
                        resourceName: `${faktur} - ${fileType}`,
                        operation: 'READ',
                        ipAddress: ipAddress,
                        userAgent: req.headers['user-agent'] || 'Unknown',
                        requestPath: `/api/invoice/download-file/${faktur}/${fileType}`,
                        requestMethod: 'GET',
                        statusCode: 404,
                        responseMessage: null,
                        errorMessage: `${fileType} file not uploaded`,
                        isSuspicious: false,
                        severity: 'warning'
                    }).catch(() => {});
                    return res.status(404).json({ 
                        error: `File not uploaded yet`,
                        fileType: fileType,
                        faktur: faktur
                    });
                }
                
                console.log(`[Invoice Download] File type: ${fileType}, path: ${filePath}`);
                
                try {
                    // OPTIMIZATION: Check cache first
                    const cacheDir = path.join(__dirname, '..', 'cache', 'downloads');
                    if (!fs.existsSync(cacheDir)) {
                        fs.mkdirSync(cacheDir, { recursive: true });
                    }
                    
                    // Create cache key from path (sanitized)
                    const cacheKey = Buffer.from(filePath).toString('hex');
                    const cachedFilePath = path.join(cacheDir, cacheKey);
                    
                    let fileBuffer = null;
                    let fromCache = false;
                    
                    // Try to load from cache
                    if (fs.existsSync(cachedFilePath)) {
                        try {
                            const stats = fs.statSync(cachedFilePath);
                            // Cache valid if less than DOWNLOAD_CACHE_TTL old
                            // (default 1 jam - file yang dihapus dari storage
                            //  tidak bisa "berhilang" terlalu lama dari cache)
                            const cacheTtlMs = (Number(process.env.DOWNLOAD_CACHE_TTL_MINUTES) || 60) * 60 * 1000;
                            if (Date.now() - stats.mtimeMs < cacheTtlMs) {
                                fileBuffer = fs.readFileSync(cachedFilePath);
                                fromCache = true;
                                console.log(`[Invoice Download] ? Cache HIT: ${filePath.split('/').pop()} (${fileBuffer.length} bytes)`);
                            } else {
                                // Cache expired, delete it
                                fs.unlinkSync(cachedFilePath);
                                console.log(`[Invoice Download] Cache expired, will re-download`);
                            }
                        } catch (cacheErr) {
                            console.warn(`[Invoice Download] Cache read error, will download:`, cacheErr.message);
                        }
                    }
                    
                    // If not in cache or cache invalid, download from rclone
                    if (!fileBuffer) {
                        const downloadStartTime = Date.now();
                        
                        try {
                            fileBuffer = await R2Storage.downloadFile(filePath);
                        } catch (downloadErr) {
                            // ============================================================
                            // PERBAIKAN (A2/A5): SELF-HEALING
                            // ============================================================
                            // File tidak ada di storage (mis. dihapus lewat
                            // Storage Handler / dihapus manual di luar aplikasi).
                            // Rapikan record invoice supaya status & tombol
                            // download di dashboard langsung benar lagi.
                            const isNotFound = /not found|404|NoSuchKey|does not exist/i.test(downloadErr.message || '');
                            
                            if (isNotFound) {
                                console.warn(`[Invoice Download] File tidak ada di storage: ${filePath} - merapikan record invoice`);
                                
                                try {
                                    const heal = await clearInvoiceFileRecord({
                                        supabase,
                                        faktur,
                                        fileType,
                                        deletedPath: filePath
                                    });
                                    console.log(`[Invoice Download] ✅ Self-healing ${faktur}/${fileType} -> count=${heal.count}/${heal.required}`);
                                } catch (healErr) {
                                    console.warn(`[Invoice Download] Self-healing gagal: ${healErr.message}`);
                                }
                                
                                return res.status(404).json({
                                    error: 'File tidak ditemukan di storage',
                                    message: 'File ini sudah tidak ada di penyimpanan. Status file telah diperbarui, silakan muat ulang halaman.',
                                    fileType,
                                    faktur
                                });
                            }
                            
                            throw downloadErr;
                        }
                        
                        const downloadTime = Date.now() - downloadStartTime;
                        console.log(`[Invoice Download] Rclone download took ${downloadTime}ms (${fileBuffer.length} bytes)`);
                        
                        // Save to cache for future requests
                        try {
                            fs.writeFileSync(cachedFilePath, fileBuffer);
                            console.log(`[Invoice Download] ? Cached for future requests`);
                        } catch (cacheWriteErr) {
                            console.warn(`[Invoice Download] Cache write failed (non-blocking):`, cacheWriteErr.message);
                        }
                    }
                    
                    // Extract filename from path
                    const filename = filePath.split('/').pop();
                    
                    // Set headers for PDF download with optimization
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                    res.setHeader('Content-Length', fileBuffer.length);
                    res.setHeader('Cache-Control', 'public, max-age=86400, immutable'); // Browser cache 24 hours
                    res.setHeader('X-Content-Type-Options', 'nosniff');
                    res.setHeader('ETag', `"${Buffer.from(filePath).toString('hex').substring(0, 16)}"`)
                    
                    // Log to audit trail BEFORE sending response
                    const totalTime = Date.now() - startTime;
                    const source = fromCache ? 'CACHE' : 'RCLONE';
                    const { ipAddress } = AuditLogger.extractClientInfo(req);
                    
                    // Fire-and-forget audit logging (don't await, don't block response)
                    auditLogger.log({
                        userId: req.user.userId,
                        userEmail: req.user.email,
                        userRole: req.user.role,
                        zonaId: invoice.zona_id,
                        action: `Download ${fileType === 'invoice' ? 'Invoice PDF' : fileType === 'bukti_bayar' ? 'Bukti Bayar' : 'Faktur Pajak'}`,
                        resourceType: 'invoice_file',
                        resourceId: faktur,
                        resourceName: `${faktur} - ${fileType}`,
                        operation: 'READ',
                        details: {
                            fileType: fileType,
                            filePath: filePath,
                            fileSize: fileBuffer.length,
                            source: source,
                            downloadTime: totalTime
                        },
                        ipAddress: ipAddress,
                        userAgent: req.headers['user-agent'] || 'Unknown',
                        requestPath: `/api/invoice/download-file/${faktur}/${fileType}`,
                        requestMethod: 'GET',
                        statusCode: 200,
                        responseMessage: 'File downloaded successfully',
                        errorMessage: null,
                        isSuspicious: false,
                        severity: 'info'
                    }).catch(err => {
                        console.warn('[Invoice Download] Audit log failed:', err.message);
                    });
                    
                    // Send file with end callback
                    console.log(`[Invoice Download] ✅ Complete in ${totalTime}ms (${source})`);
                    res.end(fileBuffer, 'binary');
                    
                } catch (downloadErr) {
                    console.error(`[Invoice Download] Download error:`, downloadErr.message);
                    return res.status(500).json({
                        error: 'Failed to download file from storage',
                        details: downloadErr.message
                    });
                }
                
            } catch (error) {
                console.error('[Invoice Download] Error:', error);
                res.status(500).json({ 
                    error: 'Server error',
                    details: error.message
                });
            }
        }
    );
    
    // ============================================
    // GET /api/invoice/combine-pdf/:faktur
    // Combine all uploaded files into single PDF
    // Order: BUKTI BAYAR + INVOICE + FAKTUR PAJAK (for PPN)
    // Order: BUKTI BAYAR + INVOICE (for NON PPN)
    // Output filename: {faktur}.pdf
    // OPTIMIZED: Caches combined PDFs locally (24h TTL)
    // First request: 10-15s (download + merge)
    // Repeat requests: <100ms (cache hit)
    // ============================================
    app.get('/api/invoice/combine-pdf/:faktur',
        ...createAuth(['super_admin', 'moderator', 'user', 'admin_zona']),
        async (req, res) => {
            try {
                const { faktur } = req.params;
                const startTime = Date.now();
                
                console.log(`[Invoice Combine] ??  Request for faktur: ${faktur}`);
                
                // Get invoice data
                const { data: invoice, error: queryError } = await supabase
                    .from('invoice_file_list')
                    .select('*')
                    .eq('faktur', faktur)
                    .single();
                
                if (queryError || !invoice) {
                    return res.status(404).json({ error: `Invoice not found: ${faktur}` });
                }
                
                // Check if all required files are uploaded
                const isPPN = invoice.keterangan && invoice.keterangan.toUpperCase() === 'PPN';
                const requiredCount = isPPN ? 3 : 2;
                
                if (invoice.files_uploaded_count < requiredCount) {
                    return res.status(400).json({
                        error: 'Not all required files uploaded',
                        status: `${invoice.files_uploaded_count}/${requiredCount}`,
                        missing: []
                            .concat(!invoice.invoice_pdf_path ? ['invoice'] : [])
                            .concat(!invoice.bukti_bayar_path ? ['bukti_bayar'] : [])
                            .concat(isPPN && !invoice.faktur_pajak_path ? ['faktur_pajak'] : [])
                    });
                }
                
                console.log(`[Invoice Combine] Combining ${requiredCount} files for ${isPPN ? 'PPN' : 'NON PPN'} invoice`);
                
                // OPTIMIZATION: Check cache first
                const cacheDir = path.join(__dirname, '..', 'cache', 'combined-pdfs');
                if (!fs.existsSync(cacheDir)) {
                    fs.mkdirSync(cacheDir, { recursive: true });
                }
                
                // Create cache key from faktur + file list (handles updates)
                // Use SHA256 hash instead of full path to avoid ENAMETOOLONG errors
                const crypto = require('crypto');
                const fileListSignature = [
                    invoice.bukti_bayar_path,
                    invoice.invoice_pdf_path,
                    invoice.faktur_pajak_path
                ].filter(Boolean).join('|');
                
                const cacheKey = crypto.createHash('sha256').update(fileListSignature).digest('hex');
                const cachedFilePath = path.join(cacheDir, cacheKey + '.pdf');
                
                let mergedBuffer = null;
                let fromCache = false;
                
                // Try to load from cache
                if (fs.existsSync(cachedFilePath)) {
                    try {
                        const stats = fs.statSync(cachedFilePath);
                        // Cache valid if less than 24 hours old
                        if (Date.now() - stats.mtimeMs < 24 * 60 * 60 * 1000) {
                            mergedBuffer = fs.readFileSync(cachedFilePath);
                            fromCache = true;
                            console.log(`[Invoice Combine] ? Cache HIT: Combined PDF (${mergedBuffer.length} bytes)`);
                        } else {
                            // Cache expired
                            fs.unlinkSync(cachedFilePath);
                            console.log(`[Invoice Combine] Cache expired, will re-merge`);
                        }
                    } catch (cacheErr) {
                        console.warn(`[Invoice Combine] Cache read error, will merge:`, cacheErr.message);
                    }
                }
                
                // If not in cache, download and merge
                if (!mergedBuffer) {
                    const filesToCombine = [];
                    
                    try {
                        // Create all download promises
                        const downloadPromises = [];
                        
                        if (invoice.bukti_bayar_path) {
                            downloadPromises.push(
                                R2Storage.downloadFile(invoice.bukti_bayar_path)
                                    .then(buffer => ({ name: 'bukti_bayar', buffer }))
                            );
                        }
                        
                        if (invoice.invoice_pdf_path) {
                            downloadPromises.push(
                                R2Storage.downloadFile(invoice.invoice_pdf_path)
                                    .then(buffer => ({ name: 'invoice', buffer }))
                            );
                        }
                        
                        if (isPPN && invoice.faktur_pajak_path) {
                            downloadPromises.push(
                                R2Storage.downloadFile(invoice.faktur_pajak_path)
                                    .then(buffer => ({ name: 'faktur_pajak', buffer }))
                            );
                        }
                        
                        console.log(`[Invoice Combine] Downloading ${downloadPromises.length} files in PARALLEL...`);
                        
                        // Wait for ALL downloads to complete in parallel
                        const downloadedFiles = await Promise.all(downloadPromises);
                        filesToCombine.push(...downloadedFiles);
                        
                    } catch (downloadErr) {
                        console.error(`[Invoice Combine] Download error:`, downloadErr.message);
                        return res.status(500).json({
                            error: 'Failed to download files',
                            details: downloadErr.message
                        });
                    }
                    
                    // Combine PDFs using pdf-lib
                    try {
                        const { PDFDocument } = require('pdf-lib');
                        
                        const mergeStartTime = Date.now();
                        console.log(`[Invoice Combine] Merging ${filesToCombine.length} PDFs...`);
                        
                        // Create new PDF document
                        const mergedPdf = await PDFDocument.create();
                        
                        // Add pages from each PDF in order
                        for (const file of filesToCombine) {
                            const pdfDoc = await PDFDocument.load(file.buffer);
                            const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
                            copiedPages.forEach((page) => {
                                mergedPdf.addPage(page);
                            });
                            console.log(`[Invoice Combine] Added ${copiedPages.length} pages from ${file.name}`);
                        }
                        
                        // Save merged PDF
                        const mergedPdfBytes = await mergedPdf.save();
                        mergedBuffer = Buffer.from(mergedPdfBytes);
                        
                        const mergeTime = Date.now() - mergeStartTime;
                        console.log(`[Invoice Combine] ? Merged in ${mergeTime}ms: ${mergedBuffer.length} bytes`);
                        
                        // Save to cache for future requests
                        try {
                            fs.writeFileSync(cachedFilePath, mergedBuffer);
                            console.log(`[Invoice Combine] ? Cached for future requests`);
                        } catch (cacheWriteErr) {
                            console.warn(`[Invoice Combine] Cache write failed (non-blocking):`, cacheWriteErr.message);
                        }
                        
                    } catch (combineErr) {
                        console.error(`[Invoice Combine] Combine error:`, combineErr.message);
                        return res.status(500).json({
                            error: 'Failed to combine PDFs',
                            details: combineErr.message
                        });
                    }
                }
                
                // Send cached or freshly merged PDF
                const outputFilename = `${faktur}.pdf`;
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
                res.setHeader('Content-Length', mergedBuffer.length);
                res.setHeader('Cache-Control', 'public, max-age=3600');
                
                res.send(mergedBuffer);
                
                const totalTime = Date.now() - startTime;
                const source = fromCache ? 'CACHE' : 'MERGE';
                console.log(`[Invoice Combine] ? Complete in ${totalTime}ms (${source})`);
                
            } catch (error) {
                console.error('[Invoice Combine] Error:', error);
                res.status(500).json({ 
                    error: 'Server error',
                    details: error.message
                });
            }
        }
    );
    
    // ============================================
    // POST /api/invoice/search-existing-files/:faktur
    // Search for existing files in Google Drive using new location-based paths
    // This helps discover files uploaded manually or with old paths
    // ============================================
    app.post('/api/invoice/search-existing-files/:faktur',
        ...createAuth(['super_admin', 'moderator']),
        async (req, res) => {
            try {
                const { faktur } = req.params;
                
                console.log(`[Invoice Search] Searching for files with faktur: ${faktur}`);
                
                // Get invoice data
                const { data: invoice, error: queryError } = await supabase
                    .from('invoice_file_list')
                    .select('*')
                    .eq('faktur', faktur)
                    .single();
                
                if (queryError || !invoice) {
                    return res.status(404).json({ error: `Invoice not found: ${faktur}` });
                }
                
                const location = extractLocationFromToko(invoice.toko);
                const year = invoice.tanggal.split('-')[0];
                const monthNum = String(invoice.tanggal.split('-')[1]).padStart(2, '0');
                const day = String(invoice.tanggal.split('-')[2]).padStart(2, '0');
                
                const monthNames = [
                    'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
                    'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
                ];
                const monthName = monthNames[parseInt(monthNum) - 1] || monthNum;
                
                const category = invoice.keterangan === 'PPN' ? 'PPN' : 'NON';
                
                console.log(`[Invoice Search] Location: ${location}, Date: ${year}/${monthName}/${day}, Category: ${category}`);
                
                const foundFiles = {
                    invoice: null,
                    bukti_bayar: null,
                    faktur_pajak: null,
                    updated: []
                };
                
                // ============================================================
                // PERBAIKAN (A4): gunakan path builder yang SAMA dengan
                // saat upload. Versi lama memakai path lama
                // ('ARSIPINVOICE/...') dan folder yang tidak sesuai
                // ('BUKTIBAYAR', 'FAKTURPAJAK') -> file tidak pernah ditemukan.
                // ============================================================
                try {
                    // Search for invoice PDF
                    const invoiceSearchPath = R2Storage.buildInvoicePath({
                        location, category, year, month: monthName, day, filename: ''
                    }).replace(/\/$/, '');
                    console.log(`[Invoice Search] Searching invoice in: ${invoiceSearchPath}`);
                    const invoiceFiles = await R2Storage.listFiles(invoiceSearchPath);
                    const invoiceFile = invoiceFiles.find(f => f.name.includes(faktur) && f.name.endsWith('.pdf'));
                    if (invoiceFile && !invoiceFile.is_dir) {
                        const invoicePath = R2Storage.buildInvoicePath({
                            location, category, year, month: monthName, day, filename: invoiceFile.name
                        });
                        foundFiles.invoice = invoicePath;
                        console.log(`[Invoice Search] Found invoice: ${invoicePath}`);
                    }
                } catch (err) {
                    console.log(`[Invoice Search] No invoice found (path may not exist):`, err.message);
                }
                
                try {
                    // Search for bukti bayar
                    const buktiSearchPath = R2Storage.buildDocumentPath({
                        location, folderType: 'bukti-bayar', year, month: monthName, day, filename: ''
                    }).replace(/\/$/, '');
                    console.log(`[Invoice Search] Searching bukti bayar in: ${buktiSearchPath}`);
                    const buktiFiles = await R2Storage.listFiles(buktiSearchPath);
                    const buktiFile = buktiFiles.find(f => f.name.includes(faktur) && f.name.endsWith('.pdf'));
                    if (buktiFile && !buktiFile.is_dir) {
                        const buktiPath = R2Storage.buildDocumentPath({
                            location, folderType: 'bukti-bayar', year, month: monthName, day, filename: buktiFile.name
                        });
                        foundFiles.bukti_bayar = buktiPath;
                        console.log(`[Invoice Search] Found bukti bayar: ${buktiPath}`);
                    }
                } catch (err) {
                    console.log(`[Invoice Search] No bukti bayar found:`, err.message);
                }
                
                try {
                    // Search for faktur pajak
                    const fakturSearchPath = R2Storage.buildDocumentPath({
                        location, folderType: 'Faktur-Pajak', year, month: monthName, day, filename: ''
                    }).replace(/\/$/, '');
                    console.log(`[Invoice Search] Searching faktur pajak in: ${fakturSearchPath}`);
                    const fakturFiles = await R2Storage.listFiles(fakturSearchPath);
                    const fakturFile = fakturFiles.find(f => f.name.includes('tax-') && f.name.includes(faktur) && f.name.endsWith('.pdf'));
                    if (fakturFile && !fakturFile.is_dir) {
                        const fakturPath = R2Storage.buildDocumentPath({
                            location, folderType: 'Faktur-Pajak', year, month: monthName, day, filename: fakturFile.name
                        });
                        foundFiles.faktur_pajak = fakturPath;
                        console.log(`[Invoice Search] Found faktur pajak: ${fakturPath}`);
                    }
                } catch (err) {
                    console.log(`[Invoice Search] No faktur pajak found:`, err.message);
                }
                
                // Update database if files found and paths different from database
                if (foundFiles.invoice && foundFiles.invoice !== invoice.invoice_pdf_path) {
                    foundFiles.updated.push('invoice');
                }
                if (foundFiles.bukti_bayar && foundFiles.bukti_bayar !== invoice.bukti_bayar_path) {
                    foundFiles.updated.push('bukti_bayar');
                }
                if (foundFiles.faktur_pajak && foundFiles.faktur_pajak !== invoice.faktur_pajak_path) {
                    foundFiles.updated.push('faktur_pajak');
                }
                
                res.json({
                    success: true,
                    faktur,
                    location,
                    foundFiles,
                    filesUpdatedCount: foundFiles.updated.length
                });
                
            } catch (error) {
                console.error('[Invoice Search] Error:', error);
                res.status(500).json({ error: 'Server error', details: error.message });
            }
        }
    );
    
    // ============================================
    // POST /api/invoice/update-file-paths/:faktur
    // Update database with found file paths from search
    // ============================================
    app.post('/api/invoice/update-file-paths/:faktur',
        ...createAuth(['super_admin', 'moderator']),
        async (req, res) => {
            try {
                const { faktur } = req.params;
                const { foundFiles } = req.body;
                
                if (!foundFiles) {
                    return res.status(400).json({ error: 'foundFiles object is required' });
                }
                
                console.log(`[Invoice Update] Updating paths for faktur: ${faktur}`);
                
                // Prepare update object
                const updateData = {};
                if (foundFiles.invoice) updateData.invoice_pdf_path = foundFiles.invoice;
                if (foundFiles.bukti_bayar) updateData.bukti_bayar_path = foundFiles.bukti_bayar;
                if (foundFiles.faktur_pajak) updateData.faktur_pajak_path = foundFiles.faktur_pajak;
                
                if (Object.keys(updateData).length === 0) {
                    return res.status(400).json({ error: 'No file paths to update' });
                }
                
                // Update database
                const { data, error } = await supabase
                    .from('invoice_file_list')
                    .update(updateData)
                    .eq('faktur', faktur)
                    .select();
                
                if (error) {
                    console.error('[Invoice Update] Error updating paths:', error);
                    return res.status(500).json({ error: 'Failed to update paths', details: error.message });
                }
                
                console.log(`[Invoice Update] ? Updated paths for faktur: ${faktur}`, updateData);
                
                res.json({
                    success: true,
                    faktur,
                    updated: Object.keys(updateData),
                    data: data[0]
                });
                
            } catch (error) {
                console.error('[Invoice Update] Error:', error);
                res.status(500).json({ error: 'Server error', details: error.message });
            }
        }
    );
    
    // ============================================
    // POST /api/invoice/scan-all-invoices
    // Scan all invoices and search for existing files in Google Drive
    // Returns summary of found files and allows bulk update
    // ============================================
    app.post('/api/invoice/scan-all-invoices',
        ...createAuth(['super_admin', 'moderator']),
        async (req, res) => {
            try {
                const { limit = 50, offset = 0 } = req.query;
                
                console.log(`[Invoice Scan] Scanning all invoices (limit: ${limit}, offset: ${offset})`);
                
                // Get invoices to scan
                const { data: invoices, error: queryError, count } = await supabase
                    .from('invoice_file_list')
                    .select('*', { count: 'exact' })
                    .order('tanggal', { ascending: false })
                    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
                
                if (queryError) {
                    return res.status(500).json({ error: 'Failed to fetch invoices', details: queryError.message });
                }
                
                const scanResults = [];
                
                for (const invoice of invoices || []) {
                    try {
                        const location = extractLocationFromToko(invoice.toko);
                        const year = invoice.tanggal.split('-')[0];
                        const monthNum = String(invoice.tanggal.split('-')[1]).padStart(2, '0');
                        const day = String(invoice.tanggal.split('-')[2]).padStart(2, '0');
                        
                        const monthNames = [
                            'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
                            'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
                        ];
                        const monthName = monthNames[parseInt(monthNum) - 1] || monthNum;
                        
                        const category = invoice.keterangan === 'PPN' ? 'PPN' : 'NON';
                        
                        const result = {
                            faktur: invoice.faktur,
                            location,
                            found: [],
                            needsUpdate: false
                        };
                        
                        // Search for files
                        // PERBAIKAN (A4): path builder yang sama dengan upload
                        try {
                            const invoiceSearchPath = R2Storage.buildInvoicePath({
                                location, category, year, month: monthName, day, filename: ''
                            }).replace(/\/$/, '');
                            const invoiceFiles = await R2Storage.listFiles(invoiceSearchPath);
                            const invoiceFile = invoiceFiles.find(f => f.name.includes(invoice.faktur) && f.name.endsWith('.pdf'));
                            if (invoiceFile && !invoiceFile.is_dir) {
                                result.found.push('invoice');
                            }
                        } catch (err) {
                            // Path doesn't exist, continue
                        }
                        
                        try {
                            const buktiSearchPath = R2Storage.buildDocumentPath({
                                location, folderType: 'bukti-bayar', year, month: monthName, day, filename: ''
                            }).replace(/\/$/, '');
                            const buktiFiles = await R2Storage.listFiles(buktiSearchPath);
                            const buktiFile = buktiFiles.find(f => f.name.includes(invoice.faktur) && f.name.endsWith('.pdf'));
                            if (buktiFile && !buktiFile.is_dir) {
                                result.found.push('bukti_bayar');
                            }
                        } catch (err) {
                            // Path doesn't exist, continue
                        }
                        
                        try {
                            const fakturSearchPath = R2Storage.buildDocumentPath({
                                location, folderType: 'Faktur-Pajak', year, month: monthName, day, filename: ''
                            }).replace(/\/$/, '');
                            const fakturFiles = await R2Storage.listFiles(fakturSearchPath);
                            const fakturFile = fakturFiles.find(f => f.name.includes('tax-') && f.name.includes(invoice.faktur) && f.name.endsWith('.pdf'));
                            if (fakturFile && !fakturFile.is_dir) {
                                result.found.push('faktur_pajak');
                            }
                        } catch (err) {
                            // Path doesn't exist, continue
                        }
                        
                        // Check if database needs update
                        if ((result.found.includes('invoice') && !invoice.invoice_pdf_path) ||
                            (result.found.includes('bukti_bayar') && !invoice.bukti_bayar_path) ||
                            (result.found.includes('faktur_pajak') && !invoice.faktur_pajak_path)) {
                            result.needsUpdate = true;
                        }
                        
                        if (result.found.length > 0) {
                            scanResults.push(result);
                        }
                    } catch (err) {
                        console.error(`[Invoice Scan] Error scanning faktur ${invoice.faktur}:`, err.message);
                    }
                }
                
                console.log(`[Invoice Scan] ? Scanned ${invoices?.length || 0} invoices, found ${scanResults.length} with files`);
                
                res.json({
                    success: true,
                    summary: {
                        totalScanned: invoices?.length || 0,
                        totalCount: count || 0,
                        foundWithFiles: scanResults.length,
                        needsUpdate: scanResults.filter(r => r.needsUpdate).length
                    },
                    results: scanResults.slice(0, 20), // Return first 20 for display
                    hasMore: scanResults.length > 20
                });
                
            } catch (error) {
                console.error('[Invoice Scan] Error:', error);
                res.status(500).json({ error: 'Server error', details: error.message });
            }
        }
    );

    console.log('[Invoice API] Endpoints registered successfully');
}

// ============================================
// DELETE /api/invoice/clear-file/:faktur/:fileType
// Remove/clear a specific file path from an invoice
// Used when file upload failed but path was saved
// fileType: 'invoice_pdf' | 'bukti_bayar' | 'faktur_pajak'
// ============================================
function addClearFileEndpoint(app, supabase, createAuth) {
    app.delete('/api/invoice/clear-file/:faktur/:fileType',
        createAuth(['super_admin', 'moderator']),
        async (req, res) => {
            try {
                const { faktur, fileType } = req.params;
                const startTime = Date.now();
                
                if (!faktur || !fileType) {
                    const { ipAddress } = AuditLogger.extractClientInfo(req);
                    await auditLogger.log({
                        userId: req.user?.userId || null,
                        userEmail: req.user?.email || null,
                        userRole: req.user?.role || null,
                        zonaId: null,
                        action: 'Clear Invoice File - Invalid Parameters',
                        resourceType: 'invoice_file',
                        resourceId: faktur || 'unknown',
                        resourceName: faktur || 'unknown',
                        operation: 'DELETE',
                        ipAddress: ipAddress,
                        userAgent: req.headers['user-agent'] || 'Unknown',
                        requestPath: `/api/invoice/clear-file/${faktur}/${fileType}`,
                        requestMethod: 'DELETE',
                        statusCode: 400,
                        responseMessage: null,
                        errorMessage: 'Faktur and fileType are required',
                        isSuspicious: false,
                        severity: 'warning'
                    }).catch(() => {});
                    return res.status(400).json({ error: 'Faktur and fileType are required' });
                }
                
                const validTypes = ['invoice_pdf', 'bukti_bayar', 'faktur_pajak'];
                if (!validTypes.includes(fileType)) {
                    const { ipAddress } = AuditLogger.extractClientInfo(req);
                    await auditLogger.log({
                        userId: req.user?.userId || null,
                        userEmail: req.user?.email || null,
                        userRole: req.user?.role || null,
                        zonaId: null,
                        action: 'Clear Invoice File - Invalid File Type',
                        resourceType: 'invoice_file',
                        resourceId: faktur,
                        resourceName: faktur,
                        operation: 'DELETE',
                        ipAddress: ipAddress,
                        userAgent: req.headers['user-agent'] || 'Unknown',
                        requestPath: `/api/invoice/clear-file/${faktur}/${fileType}`,
                        requestMethod: 'DELETE',
                        statusCode: 400,
                        responseMessage: null,
                        errorMessage: `Invalid fileType: ${fileType}`,
                        isSuspicious: false,
                        severity: 'warning'
                    }).catch(() => {});
                    return res.status(400).json({ 
                        error: `Invalid fileType. Must be one of: ${validTypes.join(', ')}` 
                    });
                }
                
                // Get current invoice
                const { data: invoice, error: queryErr } = await supabase
                    .from('invoice_file_list')
                    .select('*')
                    .eq('faktur', faktur)
                    .single();
                
                if (queryErr || !invoice) {
                    const { ipAddress } = AuditLogger.extractClientInfo(req);
                    await auditLogger.log({
                        userId: req.user.userId,
                        userEmail: req.user.email,
                        userRole: req.user.role,
                        zonaId: null,
                        action: 'Clear Invoice File - Invoice Not Found',
                        resourceType: 'invoice_file',
                        resourceId: faktur,
                        resourceName: faktur,
                        operation: 'DELETE',
                        ipAddress: ipAddress,
                        userAgent: req.headers['user-agent'] || 'Unknown',
                        requestPath: `/api/invoice/clear-file/${faktur}/${fileType}`,
                        requestMethod: 'DELETE',
                        statusCode: 404,
                        responseMessage: null,
                        errorMessage: 'Invoice not found',
                        isSuspicious: false,
                        severity: 'warning'
                    }).catch(() => {});
                    return res.status(404).json({ error: `Invoice not found: ${faktur}` });
                }
                
                // SECURITY: Verifikasi user boleh akses invoice ini berdasarkan zona_id
                if (!enforceZoneOwnership(req, res, invoice.zona_id)) return;
                
                // Map fileType to column names
                const pathColumn = fileType === 'invoice_pdf' ? 'invoice_pdf_path' :
                                  fileType === 'bukti_bayar' ? 'bukti_bayar_path' :
                                  'faktur_pajak_path';
                
                const uploadedAtColumn = fileType === 'invoice_pdf' ? 'invoice_uploaded_at' :
                                        fileType === 'bukti_bayar' ? 'bukti_bayar_uploaded_at' :
                                        'faktur_pajak_uploaded_at';
                
                const oldPath = invoice[pathColumn];
                
                if (!oldPath) {
                    const { ipAddress } = AuditLogger.extractClientInfo(req);
                    await auditLogger.log({
                        userId: req.user.userId,
                        userEmail: req.user.email,
                        userRole: req.user.role,
                        zonaId: invoice.zona_id,
                        action: 'Clear Invoice File - File Not Found',
                        resourceType: 'invoice_file',
                        resourceId: faktur,
                        resourceName: `${faktur} - ${fileType}`,
                        operation: 'DELETE',
                        ipAddress: ipAddress,
                        userAgent: req.headers['user-agent'] || 'Unknown',
                        requestPath: `/api/invoice/clear-file/${faktur}/${fileType}`,
                        requestMethod: 'DELETE',
                        statusCode: 400,
                        responseMessage: null,
                        errorMessage: `File path not found for ${fileType}`,
                        isSuspicious: false,
                        severity: 'warning'
                    }).catch(() => {});
                    return res.status(400).json({ 
                        error: `File path not found for ${fileType}` 
                    });
                }
                
                // Clear the path and timestamp
                const updateData = {};
                updateData[pathColumn] = null;
                updateData[uploadedAtColumn] = null;
                updateData['updated_at'] = new Date().toISOString();
                
                const { error: updateErr } = await supabase
                    .from('invoice_file_list')
                    .update(updateData)
                    .eq('faktur', faktur);
                
                if (updateErr) {
                    console.error(`[ClearFile] Update error:`, updateErr);
                    const { ipAddress } = AuditLogger.extractClientInfo(req);
                    await auditLogger.log({
                        userId: req.user.userId,
                        userEmail: req.user.email,
                        userRole: req.user.role,
                        zonaId: invoice.zona_id,
                        action: 'Clear Invoice File - Update Failed',
                        resourceType: 'invoice_file',
                        resourceId: faktur,
                        resourceName: `${faktur} - ${fileType}`,
                        operation: 'DELETE',
                        ipAddress: ipAddress,
                        userAgent: req.headers['user-agent'] || 'Unknown',
                        requestPath: `/api/invoice/clear-file/${faktur}/${fileType}`,
                        requestMethod: 'DELETE',
                        statusCode: 500,
                        responseMessage: null,
                        errorMessage: 'Failed to clear file path',
                        isSuspicious: false,
                        severity: 'error'
                    }).catch(() => {});
                    return res.status(500).json({ error: 'Failed to clear file path' });
                }
                
                // ============================================================
                // PERBAIKAN (A3): hapus record invoice_files juga
                // ============================================================
                // Tanpa ini, baris di invoice_files tetap ada sehingga
                // trigger DB menghitung file yang SUDAH DIHAPUS lagi ->
                // status naik kembali (mis. 2/3 -> 3/3) begitu file lain
                // diunggah. Sekarang record ikut dibersihkan.
                const fileTypeForStatus = fileType === 'invoice_pdf' ? 'invoice' : fileType;
                await deleteInvoiceFileRow({ supabase, faktur, fileType: fileTypeForStatus });
                
                // Recalculate files_uploaded_count via sumber tunggal
                // (kolom path + invoice_files), bukan hitung manual
                const statusInfo = await syncInvoiceFileStatus({ supabase, faktur });
                const uploadedCount = statusInfo?.count ?? 0;
                
                if (!statusInfo) {
                    console.warn(`[ClearFile] Gagal sinkronkan status file untuk ${faktur}`);
                }
                
                const totalTime = Date.now() - startTime;
                console.log(`[ClearFile] ✓ Cleared ${fileType} for faktur ${faktur}. New count: ${uploadedCount} in ${totalTime}ms`);
                
                // Log to audit trail with detailed information
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: req.user.userId,
                    userEmail: req.user.email,
                    userRole: req.user.role,
                    zonaId: invoice.zona_id,
                    action: `Clear Invoice File - ${fileType === 'invoice_pdf' ? 'Invoice PDF' : fileType === 'bukti_bayar' ? 'Bukti Bayar' : 'Faktur Pajak'}`,
                    resourceType: 'invoice_file',
                    resourceId: faktur,
                    resourceName: `${faktur} - ${fileType}`,
                    operation: 'DELETE',
                    details: {
                        fileType: fileType,
                        removedPath: oldPath,
                        newFilesUploadedCount: uploadedCount,
                        filesRequiredCount: invoice.files_required_count,
                        clearanceTime: totalTime
                    },
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: `/api/invoice/clear-file/${faktur}/${fileType}`,
                    requestMethod: 'DELETE',
                    statusCode: 200,
                    responseMessage: 'File cleared successfully',
                    errorMessage: null,
                    isSuspicious: false,
                    severity: 'info'
                }).catch(() => {});
                
                res.json({
                    success: true,
                    faktur: faktur,
                    clearedFileType: fileType,
                    removedPath: oldPath,
                    newFilesUploadedCount: uploadedCount,
                    filesRequiredCount: invoice.files_required_count
                });
                
            } catch (error) {
                console.error('[ClearFile] Error:', error);
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: req.user?.userId || null,
                    userEmail: req.user?.email || null,
                    userRole: req.user?.role || null,
                    zonaId: null,
                    action: 'Clear Invoice File - Server Error',
                    resourceType: 'invoice_file',
                    resourceId: req.params.faktur,
                    resourceName: req.params.faktur,
                    operation: 'DELETE',
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: `/api/invoice/clear-file/${req.params.faktur}/${req.params.fileType}`,
                    requestMethod: 'DELETE',
                    statusCode: 500,
                    responseMessage: null,
                    errorMessage: error.message,
                    isSuspicious: false,
                    severity: 'error'
                }).catch(() => {});
                res.status(500).json({ error: 'Server error', details: error.message });
            }
        }
    );
}

// ============================================
// POST /api/invoice/verify-files-in-gdrive/:faktur
// Verify files actually exist in Google Drive (not just DB paths)
// Corrects files_uploaded_count based on actual file existence
// ============================================
function addFileExistenceVerificationEndpoint(app, supabase, createAuth, R2Storage) {
    app.post('/api/invoice/verify-files-in-gdrive/:faktur',
        createAuth(['super_admin', 'moderator']),
        async (req, res) => {
            try {
                const { faktur } = req.params;
                
                if (!faktur) {
                    return res.status(400).json({ error: 'Faktur is required' });
                }
                
                // Get current invoice data - try NEW schema first
                const { data: newData, error: newError } = await supabase
                    .from('invoice_file_list')
                    .select('invoice_pdf_path, bukti_bayar_path, faktur_pajak_path, files_uploaded_count, keterangan')
                    .eq('faktur', faktur)
                    .single();
                
                let invoice = null;
                if (!newError && newData) {
                    invoice = newData;
                } else if (newError && newError.message.includes('does not exist')) {
                    // Fallback: OLD schema
                    const { data: oldData, error: oldError } = await supabase
                        .from('invoice_file_list')
                        .select('uploaded_file_path, keterangan')
                        .eq('faktur', faktur)
                        .single();
                    
                    invoice = oldData;
                    if (oldError || !oldData) {
                        return res.status(404).json({ error: `Invoice not found: ${faktur}` });
                    }
                } else {
                    return res.status(404).json({ error: `Invoice not found: ${faktur}` });
                }
                
                if (!invoice) {
                    return res.status(404).json({ error: `Invoice not found: ${faktur}` });
                }
                
                console.log(`[FileExist Verify] Checking actual file existence for faktur: ${faktur}`);
                
                // Check each file with timeout
                const checkPromises = [];
                const fileTypes = [];
                
                if (invoice.invoice_pdf_path) {
                    checkPromises.push(
                        Promise.race([
                            R2Storage.checkFileExists(invoice.invoice_pdf_path),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
                        ]).catch(() => false)
                    );
                    fileTypes.push({ type: 'invoice_pdf', path: invoice.invoice_pdf_path });
                }
                
                if (invoice.bukti_bayar_path) {
                    checkPromises.push(
                        Promise.race([
                            R2Storage.checkFileExists(invoice.bukti_bayar_path),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
                        ]).catch(() => false)
                    );
                    fileTypes.push({ type: 'bukti_bayar', path: invoice.bukti_bayar_path });
                }
                
                if (invoice.faktur_pajak_path) {
                    checkPromises.push(
                        Promise.race([
                            R2Storage.checkFileExists(invoice.faktur_pajak_path),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
                        ]).catch(() => false)
                    );
                    fileTypes.push({ type: 'faktur_pajak', path: invoice.faktur_pajak_path });
                }
                
                // Execute all checks
                const results = await Promise.all(checkPromises);
                
                // Count actual files that exist
                let actualFilesExist = 0;
                const fileStatus = {};
                
                for (let i = 0; i < results.length; i++) {
                    const exists = results[i];
                    const fileInfo = fileTypes[i];
                    fileStatus[fileInfo.type] = {
                        path: fileInfo.path,
                        exists: exists
                    };
                    if (exists) actualFilesExist++;
                    console.log(`[FileExist Verify] ${fileInfo.type}: ${exists ? 'EXISTS' : 'MISSING'}`);
                }
                
                const dbCount = invoice.files_uploaded_count || 0;
                
                // If actual count differs from DB count, correct it
                let corrected = false;
                if (actualFilesExist !== dbCount) {
                    console.warn(`[FileExist Verify] Mismatch found for ${faktur}: DB=${dbCount}, Actual=${actualFilesExist}. Correcting...`);
                    
                    const { error: updateErr } = await supabase
                        .from('invoice_file_list')
                        .update({
                            files_uploaded_count: actualFilesExist,
                            files_required_count: invoice.keterangan === 'PPN' ? 3 : 2,
                            updated_at: new Date().toISOString()
                        })
                        .eq('faktur', faktur);
                    
                    if (updateErr) {
                        console.error(`[FileExist Verify] Update error:`, updateErr);
                        return res.status(500).json({ error: 'Failed to update database' });
                    }
                    
                    corrected = true;
                    console.log(`[FileExist Verify] ? Corrected ${faktur}: ${dbCount} ? ${actualFilesExist}`);
                }
                
                res.json({
                    success: true,
                    faktur: faktur,
                    previousDatabaseCount: dbCount,
                    actualFilesExistCount: actualFilesExist,
                    wasCorrected: corrected,
                    fileStatus: fileStatus
                });
                
            } catch (error) {
                console.error('[FileExist Verify] Error:', error);
                res.status(500).json({ error: 'Server error', details: error.message });
            }
        }
    );
}

/**
 * Add endpoint to manually sync all file counts
 * POST /api/invoice/batch-sync-file-counts
 */
function addBatchSyncEndpoint(app, supabase, createAuth, featureFlags, queryOptimizer) {
    app.post('/api/invoice/batch-sync-file-counts',
        createAuth(['super_admin']),
        async (req, res) => {
            try {
                console.log('[API] Batch sync triggered by super_admin');
                
                // Check if feature flag is enabled for this user
                const useOptimized = featureFlags ? featureFlags.isEnabled('USE_OPTIMIZED_QUERIES', req.user?.id) : false;
                
                let result;
                if (useOptimized && queryOptimizer) {
                    console.log('[API] Using optimized batch sync (75x faster!)');
                    result = await queryOptimizer.batchSyncFileCountsOptimized(supabase);
                } else {
                    console.log('[API] Using legacy batch sync (fallback)');
                    result = await batchSyncAllFileCount(supabase);
                }
                
                // Track query count for monitoring
                if (req.queryCount === undefined) {
                    req.queryCount = result.queriesExecuted || 0;
                }
                
                res.json(result);
                
            } catch (error) {
                console.error('[API] Batch sync error:', error);
                res.status(500).json({ 
                    success: false, 
                    error: 'Batch sync failed', 
                    details: error.message 
                });
            }
        }
    );
}

// ============================================
// POST /api/invoice/sync-all-file-counts
// Manual trigger to sync all invoice file counts NOW
// (normally runs every 5 minutes in background)
// ============================================
function addManualSyncEndpoint(app, supabase, createAuth, fileCountSyncJob) {
    app.post('/api/invoice/sync-all-file-counts',
        createAuth(['super_admin', 'moderator']),
        async (req, res) => {
            try {
                console.log('[ManualSync] Manual sync triggered by user');
                
                // Get sync module - this will be passed from server.js
                if (!fileCountSyncJob || !fileCountSyncJob.runSync) {
                    return res.status(500).json({ 
                        error: 'Sync module not available',
                        message: 'File count sync service is not initialized'
                    });
                }
                
                // Run sync and WAIT for completion (blocking)
                // This ensures client has accurate counts before rendering
                console.log('[ManualSync] Waiting for sync to complete...');
                const result = await fileCountSyncJob.runSync();
                
                console.log('[ManualSync] ? Sync completed:', result);
                
                // Return with actual sync results
                res.json({
                    success: true,
                    message: 'File count sync completed',
                    status: 'complete',
                    ...result
                });
                
            } catch (error) {
                console.error('[ManualSync] Error:', error);
                res.status(500).json({ error: 'Server error', details: error.message });
            }
        }
    );
}

module.exports = { 
    registerInvoiceEndpoints, 
    addFileExistenceVerificationEndpoint, 
    addClearFileEndpoint,
    addBatchSyncEndpoint,
    addManualSyncEndpoint,
    batchSyncAllFileCount
};
