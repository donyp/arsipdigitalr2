// ============================================================
// Invoice System API Endpoints
// Handles Excel upload, invoice list, PDF upload, and matching
// ============================================================

// Check if required modules are available
let multer, uuid, parseExcel, validateData, upload;
const path = require('path');
const fs = require('fs');

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
    console.error('[Invoice Endpoints] âŒ Missing dependencies:', err.message);
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
 */
async function updateFilesUploadedCount(supabase, faktur, R2Storage) {
    try {
        console.log(`[UpdateCount] Scanning R2 for files for faktur: ${faktur}...`);
        
        // First get the invoice to fetch date and toko info
        const { data: invoice, error: invError } = await supabase
            .from('invoice_file_list')
            .select('keterangan, tanggal, toko')
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
        
        // Parse date from invoice (YYYY-MM-DD format)
        const year = invoice.tanggal.split('-')[0];
        const monthNum = String(invoice.tanggal.split('-')[1]).padStart(2, '0');
        const day = String(invoice.tanggal.split('-')[2]).padStart(2, '0');
        
        // Convert month number to Indonesian month name
        const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
                           'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
        const monthName = monthNames[parseInt(monthNum) - 1];
        
        // Extract location from toko name
        const location = invoice.toko ? (invoice.toko.includes('PEMALANG') ? 'PEMALANG' : 'BEKASI') : 'BEKASI';
        
        const filename = `${faktur}.pdf`;
        let invoiceCount = 0, buktiCount = 0, fakturCount = 0;
        
        console.log(`[UpdateCount] Using date: ${year}/${monthName}/${day}, location: ${location}`);
        
        // Check invoice PDF - try PPN and NON paths for this date
        const invoicePaths = [
            `ARSIP/${location}/PPN/${year}/${monthName}/${day}/${filename}`,
            `ARSIP/${location}/NON/${year}/${monthName}/${day}/${filename}`
        ];
        
        for (const path of invoicePaths) {
            try {
                const exists = await R2Storage.checkFileExistsNoCache(path);
                if (exists) {
                    invoiceCount = 1;
                    console.log(`[UpdateCount] ✓ Found invoice: ${path}`);
                    break;
                }
            } catch (err) {
                // Continue checking
            }
        }
        
        // Check bukti bayar
        const buktiPaths = [
            `ARSIP/${location}/bukti-bayar/${year}/${monthName}/${day}/${filename}`
        ];
        
        for (const path of buktiPaths) {
            try {
                const exists = await R2Storage.checkFileExistsNoCache(path);
                if (exists) {
                    buktiCount = 1;
                    console.log(`[UpdateCount] ✓ Found bukti bayar: ${path}`);
                    break;
                }
            } catch (err) {
                // Continue checking
            }
        }
        
        // Check faktur pajak
        const fakturPaths = [
            `ARSIP/${location}/faktur-pajak/${year}/${monthName}/${day}/${filename}`,
            `ARSIP/${location}/Faktur-Pajak/${year}/${monthName}/${day}/${filename}`
        ];
        
        for (const path of fakturPaths) {
            try {
                const exists = await R2Storage.checkFileExistsNoCache(path);
                if (exists) {
                    fakturCount = 1;
                    console.log(`[UpdateCount] ✓ Found faktur pajak: ${path}`);
                    break;
                }
            } catch (err) {
                // Continue checking
            }
        }
        
        const uploadedCount = invoiceCount + buktiCount + fakturCount;
        
        const isPPN = invoice?.keterangan?.toUpperCase() === 'PPN';
        const requiredCount = isPPN ? 3 : 2;
        
        console.log(`[UpdateCount] ✅ R2 scan complete: ${uploadedCount}/${requiredCount}`);
        console.log(`[UpdateCount] Files - Invoice: ${invoiceCount}, Bukti: ${buktiCount}, Faktur Pajak: ${fakturCount}`);
        
        // Save the count to database so frontend can read it
        try {
            console.log(`[UpdateCount] Attempting to save: ${uploadedCount}/${requiredCount} for faktur ${faktur}`);
            
            // Try method 1: Update new columns (if they exist)
            const { data: updateData, error: updateErr } = await supabase
                .from('invoice_file_list')
                .update({
                    files_uploaded_count: uploadedCount,
                    files_required_count: requiredCount,
                    updated_at: new Date().toISOString()
                })
                .eq('faktur', faktur);
            
            if (updateErr && updateErr.message.includes('files_required_count')) {
                console.log(`[UpdateCount] ⚠️  Columns don't exist yet. Need to run migration first.`);
                console.log(`[UpdateCount] Migration needed: backend/ADD_FILE_COUNT_COLUMNS.sql`);
                
                // Fallback: just update timestamp so frontend can at least refresh
                const { error: tsErr } = await supabase
                    .from('invoice_file_list')
                    .update({ updated_at: new Date().toISOString() })
                    .eq('faktur', faktur);
                
                if (!tsErr) {
                    console.log(`[UpdateCount] ✅ Updated timestamp (columns will be created after migration)`);
                } else {
                    console.error(`[UpdateCount] ❌ Even timestamp update failed:`, tsErr.message);
                }
            } else if (updateErr) {
                console.error(`[UpdateCount] ❌ Update error:`, updateErr.code, updateErr.message);
            } else {
                console.log(`[UpdateCount] ✅ Saved count to database: ${uploadedCount}/${requiredCount}`);
            }
        } catch (saveErr) {
            console.error(`[UpdateCount] ❌ Exception while saving:`, saveErr.message);
        }
        
        return uploadedCount;
        
    } catch (err) {
        console.error(`[UpdateCount] Error:`, err.message);
        return 0;
    }
}

function registerInvoiceEndpoints(app, supabase, createAuth, R2Storage) {
    
    // Check if dependencies are loaded
    if (!multer || !uuid || !parseExcel) {
        console.error('[Invoice Endpoints] âš ï¸  Dependencies not loaded. Invoice endpoints will NOT be registered.');
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
            
            for (const inv of invoicesWithoutZona) {
                try {
                    // Look up zona_id from toko name
                    const { data: tokoData, error: tokoError } = await supabase
                        .from('toko')
                        .select('id, zona_id')
                        .eq('nama', inv.toko)
                        .maybeSingle();
                    
                    if (tokoError) {
                        console.error(`[Invoice API] Error looking up toko "${inv.toko}":`, tokoError);
                        failed++;
                        continue;
                    }
                    
                    if (tokoData && tokoData.zona_id) {
                        // Update invoice with zona_id
                        const { error: updateError } = await supabase
                            .from('invoice_file_list')
                            .update({ 
                                zona_id: tokoData.zona_id,
                                toko_id: tokoData.id
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
                        console.warn(`[Invoice API] Could not find zona_id for toko: "${inv.toko}"`);
                        failed++;
                    }
                } catch (err) {
                    console.error(`[Invoice API] Error processing invoice ${inv.id}:`, err);
                    failed++;
                }
            }
            
            console.log(`[Invoice API] ✅ Zona ID population complete: ${updated} updated, ${failed} failed`);
            
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
    app.post('/api/invoice/upload-excel-data',
        ...createAuth(['super_admin', 'moderator']),
        async (req, res) => {
            try {
                const { filename, data, summary } = req.body;
                
                console.log(`[Invoice API] Excel data upload by ${req.user?.name} (ID: ${req.user?.id})`);
                console.log(`[Invoice API] Received ${data?.length || 0} pre-parsed rows`);
                console.log(`[Invoice API] User authenticated:`, !!req.user);
                
                if (!data || !Array.isArray(data) || data.length === 0) {
                    return res.status(400).json({ 
                        error: 'No data provided',
                        details: 'Data array is empty or invalid'
                    });
                }
                
                // Create batch record
                const batchId = uuidv4();
                const { error: batchError } = await supabase
                    .from('excel_upload_batches')
                    .insert({
                        id: batchId,
                        filename: filename,
                        total_rows: data.length,
                        processed_rows: 0,
                        failed_rows: 0,
                        duplicate_rows: 0,
                        uploaded_by: req.user.id,
                        status: 'processing'
                    });
                
                if (batchError) {
                    console.error('[Invoice API] Error creating batch:', batchError);
                    // Continue anyway, batch is optional
                }
                
                // DEBUG: Log first few rows to check data structure
                console.log('[Invoice API] Raw data sample (first 3):');
                data.slice(0, 3).forEach((row, idx) => {
                    console.log(`  Row ${idx}: faktur=${row.faktur}, toko="${row.toko}", konsumen="${row.konsumen}"`);
                });
                
                // BULK CHECK: Get all existing fakturs in one query
                const fakturs = data.map(item => item.faktur).filter(Boolean);
                console.log(`[Invoice API] Checking ${fakturs.length} fakturs for duplicates...`);
                console.log(`[Invoice API] Sample fakturs:`, fakturs.slice(0, 5));
                
                if (fakturs.length === 0) {
                    console.warn('[Invoice API] ⚠️ WARNING: No fakturs found in data!');
                }
                
                const { data: existingInvoices } = await supabase
                    .from('invoice_file_list')
                    .select('faktur')
                    .in('faktur', fakturs);
                
                const existingFakturs = new Set((existingInvoices || []).map(inv => inv.faktur));
                console.log(`[Invoice API] Found ${existingFakturs.size} existing fakturs`);
                console.log(`[Invoice API] Sample existing:`, Array.from(existingFakturs).slice(0, 5));
                
                // BULK INSERT: Insert all invoices one-by-one to handle duplicates
                const invoicesToInsert = await Promise.all(data.map(async (item) => {
                    // Parse date string (DD-MM-YYYY format from Excel) to ISO date
                    let tanggalDate = null;
                    if (item.tanggal) {
                        try {
                            const [day, month, year] = item.tanggal.toString().split('-');
                            if (day && month && year) {
                                tanggalDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            }
                        } catch (e) {
                            console.warn(`[Invoice API] Could not parse date for faktur ${item.faktur}:`, item.tanggal);
                        }
                    }
                    
                    // Look up zona_id from konsumen name (actual store name in toko table)
                    // Zona lookup: EXACT MATCH ONLY (no fuzzy/partial matching)
                    let zona_id = null;
                    if (item.konsumen) {
                        const konsumenLower = item.konsumen.trim().toLowerCase();
                        
                        // Get all toko records for exact matching
                        const { data: allToko } = await supabase
                            .from('toko')
                            .select('nama, zona_id');
                        
                        if (allToko) {
                            // EXACT MATCH ONLY: case-insensitive, whitespace-normalized
                            const match = allToko.find(t => 
                                t.nama.trim().toLowerCase() === konsumenLower
                            );
                            
                            if (match && match.zona_id) {
                                zona_id = match.zona_id;
                                console.log(`[Invoice API] ✅ Matched konsumen "${item.konsumen}" to zona_id ${zona_id}`);
                            } else {
                                console.warn(`[Invoice API] ⚠️  No exact match for konsumen: "${item.konsumen}" (zona_id will be NULL)`);
                            }
                        }
                    }
                    
                    const invoiceRecord = {
                        tanggal: tanggalDate || new Date().toISOString().split('T')[0], // Fallback to today if parse fails
                        toko: item.toko,
                        zona_id: zona_id,  // ADD ZONA_ID!
                        faktur: item.faktur,
                        metode_bayar: item.metode_bayar,
                        jenis_transaksi: item.jenis_transaksi,
                        konsumen: item.konsumen,
                        keterangan: item.keterangan,
                        total_jumlah_jual: parseFloat(item.total_jumlah_jual) || 0,
                        item_count: parseInt(item.item_count) || 1,
                        status: 'PENDING',
                        excel_batch_id: batchId,
                        excel_uploaded_at: new Date().toISOString(),
                        excel_uploaded_by: req.user.id
                    };
                    
                    // Log toko value for debugging
                    if (!item.toko || item.toko === '' || item.toko === '-') {
                        console.warn(`[Invoice API] ⚠️  Faktur ${item.faktur}: toko is EMPTY or INVALID: "${item.toko}"`);
                    }
                    
                    return invoiceRecord;
                }));
                
                let processedCount = 0;
                let duplicateCount = 0;  // RESET THIS!
                let failedCount = 0;
                const errors = [];
                
                // BULK INSERT - one shot, let DB handle duplicates via constraint
                if (invoicesToInsert.length > 0) {
                    console.log('[Invoice API] Bulk inserting', invoicesToInsert.length, 'invoices...');
                    console.log('[Invoice API] Sample toko values:', invoicesToInsert.slice(0, 3).map(i => `"${i.toko}"`).join(', '));
                    
                    const { data: inserted, error: insertError } = await supabase
                        .from('invoice_file_list')
                        .insert(invoicesToInsert);
                    
                    if (insertError) {
                        // There IS an error
                        console.error('[Invoice API] ❌ INSERT ERROR DETAILS:');
                        console.error('  Code:', insertError.code);
                        console.error('  Message:', insertError.message);
                        console.error('  Details:', insertError.details);
                        console.error('  Full:', JSON.stringify(insertError, null, 2));
                        
                        if (insertError.code === '23505') {
                            // Duplicate key constraint - expected on re-upload
                            processedCount = 0;
                            duplicateCount = invoicesToInsert.length;
                            console.log('[Invoice API] ℹ️ All rows were duplicates (expected on re-upload)');
                        } else {
                            // Real error - something went wrong
                            failedCount = invoicesToInsert.length;
                            errors.push(`Bulk insert failed: ${insertError.message}`);
                            console.error('[Invoice API] Real error - not duplicate key');
                        }
                    } else {
                        // NO ERROR = SUCCESS!
                        processedCount = invoicesToInsert.length;
                        duplicateCount = 0;
                        failedCount = 0;
                        console.log(`[Invoice API] ✅ Successfully inserted ${processedCount} invoices`);
                    }
                } else {
                    console.warn('[Invoice API] No invoices to insert');
                }
                
                // Update batch
                await supabase
                    .from('excel_upload_batches')
                    .update({
                        processed_rows: processedCount,
                        failed_rows: failedCount,
                        duplicate_rows: duplicateCount,
                        status: failedCount > 0 ? 'completed_with_errors' : 'completed'
                    })
                    .eq('id', batchId);
                
                res.json({
                    success: true,
                    batchId,
                    summary: {
                        totalReceived: data.length,
                        processed: processedCount,
                        duplicates: duplicateCount,
                        failed: failedCount
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

                // Query database for existing fakturs
                const { data: existingInvoices, error: queryError } = await supabase
                    .from('invoice_file_list')
                    .select('faktur')
                    .in('faktur', validFakturs);

                if (queryError) {
                    console.error('[Invoice API] Query error:', queryError);
                    return res.status(500).json({
                        error: 'Database query failed',
                        details: queryError.message
                    });
                }

                // Build list of duplicates
                const existingFakturs = (existingInvoices || []).map(inv => inv.faktur);
                const duplicates = validFakturs.filter(f => existingFakturs.includes(f));

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
                const errors = [];
                
                for (const item of parseResult.data) {
                    try {
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
                    context: `Uploaded ${req.file.originalname}: ${processedCount} processed, ${duplicateCount} duplicates, ${failedCount} failed`
                });
                
                console.log('[Invoice API] Upload complete:', {
                    processed: processedCount,
                    duplicates: duplicateCount,
                    failed: failedCount
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
            const { 
                status, 
                toko, 
                keterangan,
                date_from,
                date_to,
                search,
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
                const trimmedSearch = search.trim();
                query = query.or(`faktur.ilike.%${trimmedSearch}%,konsumen.ilike.%${trimmedSearch}%`);
            }
            
            // Order by date desc
            query = query
                .order('tanggal', { ascending: false })
                .order('created_at', { ascending: false })
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
            
            // Enrich data with files_uploaded_count (calculated from individual file path columns)
            const enrichedData = data.map(inv => {
                const isPPN = inv.keterangan && inv.keterangan.toUpperCase() === 'PPN';
                const filesRequired = isPPN ? 3 : 2;
                
                // Count non-null individual file paths
                let filesUploaded = 0;
                if (inv.invoice_pdf_path) filesUploaded++;
                if (inv.bukti_bayar_path) filesUploaded++;
                if (inv.faktur_pajak_path) filesUploaded++;
                
                // Fallback: if new columns are empty, count uploaded_file_path
                if (filesUploaded === 0 && inv.uploaded_file_path) {
                    filesUploaded = 1;
                }
                
                return {
                    ...inv,
                    files_uploaded_count: filesUploaded,
                    files_required_count: filesRequired
                };
            });
            
            // Debug: Show sample data if admin_zona returns 0 results
            if (req.user && req.user.role === 'admin_zona' && count === 0) {
                console.warn(`[Invoice List] ⚠️ Admin_zona ${req.user.userId} (zona_id: ${req.user.zona_id}) returned 0 invoices!`);
                // Check if invoices exist at all for this zona
                const { data: checkData, error: checkErr } = await supabase
                    .from('invoice_file_list')
                    .select('COUNT(*)', { count: 'exact' })
                    .eq('zona_id', parseInt(req.user.zona_id) || req.user.zona_id);
                console.warn(`[Invoice List] Total invoices in zona ${req.user.zona_id}:`, checkData, checkErr);
            }
            
            res.json({
                success: true,
                data: enrichedData,
                count,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
            
        } catch (error) {
            console.error('[Invoice API] List error:', error);
            console.error('[Invoice API] Stack:', error.stack);
            res.status(500).json({ error: 'Server error', details: error.message });
        }
    });
    
    // ============================================
    // GET /api/invoice/zona/:zonaId/summary
    // Get toko summary for a specific zona
    // ============================================
    app.get('/api/invoice/zona/:zonaId/summary', createAuth(), async (req, res) => {
        try {
            const zonaId = parseInt(req.params.zonaId) || req.params.zonaId;
            
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
        try {
            const { data, error } = await supabase
                .rpc('get_invoice_statistics');
            
            if (error) {
                console.error('[Invoice API] Error fetching stats:', error);
                return res.status(500).json({ error: 'Failed to fetch statistics' });
            }
            
            res.json({
                success: true,
                stats: data[0] || {}
            });
            
        } catch (error) {
            console.error('[Invoice API] Stats error:', error);
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
                
                console.log(`[Invoice API] Delete request for faktur: ${faktur}`);
                
                // Get invoice data to get file paths
                const { data: invoice, error: fetchError } = await supabase
                    .from('invoice_file_list')
                    .select('invoice_pdf_path, bukti_bayar_path, faktur_pajak_path')
                    .eq('faktur', faktur)
                    .single();
                
                if (fetchError) {
                    console.warn(`[Invoice API] Invoice not found: ${faktur}`);
                    return res.status(404).json({ error: 'Invoice not found' });
                }
                
                // Delete files from Google Drive if they exist
                const filesToDelete = [];
                
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
                        console.log(`[Invoice API] ✅ Deleted ${file.name}`);
                    } catch (deleteErr) {
                        console.warn(`[Invoice API] Warning: Failed to delete ${file.name}:`, deleteErr.message);
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
                    return res.status(500).json({ error: 'Failed to delete invoice from database' });
                }
                
                console.log(`[Invoice API] ✅ Invoice ${faktur} deleted successfully`);
                
                // Log to audit
                await supabase.from('audit_logs').insert({
                    user_id: req.user.id,
                    action: 'delete_invoice',
                    context: `Deleted invoice ${faktur} with ${filesToDelete.length} files from Google Drive`
                });
                
                res.json({ 
                    success: true,
                    message: `Invoice ${faktur} and ${filesToDelete.length} files deleted`,
                    filesDeleted: filesToDelete.length
                });
                
            } catch (error) {
                console.error('[Invoice API] Delete error:', error);
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
                
                // Get batch info first
                const { data: batch, error: batchError } = await supabase
                    .from('excel_upload_batches')
                    .select('*')
                    .eq('id', batchId)
                    .single();
                
                if (batchError || !batch) {
                    return res.status(404).json({ error: 'Batch not found' });
                }
                
                // Count invoices in this batch
                const { count, error: countError } = await supabase
                    .from('invoice_file_list')
                    .select('*', { count: 'exact', head: true })
                    .eq('excel_batch_id', batchId);
                
                if (countError) {
                    console.error('[Invoice API] Count error:', countError);
                    return res.status(500).json({ error: 'Failed to count invoices' });
                }
                
                // Delete all invoices from this batch
                const { error: deleteError } = await supabase
                    .from('invoice_file_list')
                    .delete()
                    .eq('excel_batch_id', batchId);
                
                if (deleteError) {
                    console.error('[Invoice API] Batch delete error:', deleteError);
                    return res.status(500).json({ error: 'Failed to delete batch invoices' });
                }
                
                // Update batch status
                await supabase
                    .from('excel_upload_batches')
                    .update({ 
                        status: 'deleted',
                        error_log: `Deleted by ${req.user.name} at ${new Date().toISOString()}`
                    })
                    .eq('id', batchId);
                
                // Log to audit
                await supabase.from('audit_logs').insert({
                    user_id: req.user.id,
                    action: 'delete_invoice_batch',
                    context: `Deleted batch ${batch.filename} with ${count} invoices`
                });
                
                res.json({ 
                    success: true,
                    deletedCount: count,
                    batchFilename: batch.filename
                });
                
            } catch (error) {
                console.error('[Invoice API] Batch delete error:', error);
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
                    .select('faktur, status, toko, tanggal, konsumen, total_jumlah_jual, uploaded_file_path')
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
    // GET /api/invoice/check-file/:faktur/:fileType
    // Check if file exists on remote storage
    // fileType: 'invoice', 'bukti_bayar', or 'faktur_pajak'
    // 
    // SIMPLIFIED STRATEGY 1 ONLY: Database-driven approach
    // 1. Check if database has file path (invoice_pdf_path, bukti_bayar_path, faktur_pajak_path)
    // 2. If path exists → verify file really exists via R2Storage.checkFileExists()
    // 3. If file exists → return exists: true
    // 4. If database path is NULL → return exists: false with message about uploading via Moderator Dashboard
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
                        console.log(`[Check File] ✓ OLD schema query succeeded`);
                    } else {
                        console.log(`[Check File] ✗ OLD schema query failed:`, oldError?.message);
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
                        console.log(`[Check File] ✓ Found in invoice_files table: ${fileType}`);
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
                
                // Don't rely on database paths - scan R2 directly for the file
                // Get invoice date to build correct R2 paths
                const { data: invoiceForDate, error: dateErr } = await supabase
                    .from('invoice_file_list')
                    .select('tanggal, toko')
                    .eq('faktur', faktur)
                    .single();
                
                if (!dateErr && invoiceForDate && invoiceForDate.tanggal) {
                    const year = invoiceForDate.tanggal.split('-')[0];
                    const monthNum = String(invoiceForDate.tanggal.split('-')[1]).padStart(2, '0');
                    const day = String(invoiceForDate.tanggal.split('-')[2]).padStart(2, '0');
                    
                    const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
                                       'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
                    const monthName = monthNames[parseInt(monthNum) - 1];
                    const location = invoiceForDate.toko ? (invoiceForDate.toko.includes('PEMALANG') ? 'PEMALANG' : 'BEKASI') : 'BEKASI';
                    
                    const filename = `${faktur}.pdf`;
                    
                    // Build paths for the requested file type
                    let pathsToCheck = [];
                    if (fileType === 'invoice') {
                        pathsToCheck = [
                            `ARSIP/${location}/PPN/${year}/${monthName}/${day}/${filename}`,
                            `ARSIP/${location}/NON/${year}/${monthName}/${day}/${filename}`
                        ];
                    } else if (fileType === 'bukti_bayar') {
                        pathsToCheck = [
                            `ARSIP/${location}/bukti-bayar/${year}/${monthName}/${day}/${filename}`
                        ];
                    } else if (fileType === 'faktur_pajak') {
                        pathsToCheck = [
                            `ARSIP/${location}/faktur-pajak/${year}/${monthName}/${day}/${filename}`,
                            `ARSIP/${location}/Faktur-Pajak/${year}/${monthName}/${day}/${filename}`
                        ];
                    }
                    
                    // Check each possible path
                    for (const path of pathsToCheck) {
                        try {
                            const exists = await R2Storage.checkFileExistsNoCache(path);
                            if (exists) {
                                fileExists = true;
                                dbFilePath = path;
                                console.log(`[Check File] ✓ Found ${fileType}: ${path}`);
                                break;
                            }
                        } catch (err) {
                            // Continue checking
                        }
                    }
                }
                
                if (!fileExists) {
                    console.log(`[Check File] File not found in R2 for ${fileType}`);
                }

                // Count files by scanning R2 directly (source of truth)
                const filesUploaded = await updateFilesUploadedCount(supabase, faktur, R2Storage);
                
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
                    console.log(`[Verify Count] Correcting ${faktur}: ${dbCount} → ${actualCount}`);
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
    app.post('/api/invoice/upload-pdf',
        ...createAuth(['super_admin', 'moderator', 'user']),
        upload.single('pdf'),
        handleMulterError,
        async (req, res) => {
            try {
                if (!req.file) {
                    return res.status(400).json({ error: 'No PDF file provided' });
                }
                
                const filename = req.file.originalname;
                const fileBuffer = req.file.buffer;
                console.log(`[Invoice PDF] Upload started by ${req.user?.name}`);
                console.log(`[Invoice PDF] Filename: ${filename}`);
                
                // Extract faktur from filename (remove .pdf extension)
                const faktur = path.parse(filename).name; // 835100310.pdf -> 835100310
                console.log(`[Invoice PDF] Extracted faktur: ${faktur}`);
                
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
                    console.warn(`[Invoice PDF] Invoice not found for faktur: ${faktur}`);
                    return res.status(404).json({ error: `Invoice not found for faktur: ${faktur}` });
                }
                
                console.log(`[Invoice PDF] Found invoice: ${invoice.konsumen} (${invoice.toko})`);
                
                // AUTO-FIX: If zona_id is missing, populate it from toko
                if (!invoice.zona_id && invoice.toko) {
                    try {
                        console.log(`[Invoice PDF] zona_id is NULL, attempting to populate from toko: ${invoice.toko}`);
                        const { data: tokoData } = await supabase
                            .from('toko')
                            .select('zona_id')
                            .eq('nama', invoice.toko)
                            .maybeSingle();
                        
                        if (tokoData && tokoData.zona_id) {
                            // Update invoice with zona_id
                            const { error: updateError } = await supabase
                                .from('invoice_file_list')
                                .update({ zona_id: tokoData.zona_id })
                                .eq('faktur', faktur);
                            
                            if (!updateError) {
                                invoice.zona_id = tokoData.zona_id;
                                console.log(`[Invoice PDF] ✅ Auto-populated zona_id: ${tokoData.zona_id}`);
                            } else {
                                console.warn(`[Invoice PDF] Failed to auto-populate zona_id:`, updateError);
                            }
                        } else {
                            console.warn(`[Invoice PDF] Could not find zona_id for toko: ${invoice.toko}`);
                        }
                    } catch (autoFixErr) {
                        console.warn(`[Invoice PDF] Auto-populate zona_id failed:`, autoFixErr.message);
                        // Don't block upload, just log warning
                    }
                }
                
                // Determine path based on keterangan (PPN/NON PPN)
                // SAFEGUARD: Check if tanggal exists and is in valid format
                if (!invoice.tanggal) {
                    console.error(`[Invoice PDF] Invoice tanggal is missing for faktur: ${faktur}`);
                    return res.status(400).json({ error: 'Invoice tanggal tidak ditemukan' });
                }
                
                const year = invoice.tanggal.split('-')[0];
                const monthNum = String(invoice.tanggal.split('-')[1]).padStart(2, '0');
                const day = String(invoice.tanggal.split('-')[2]).padStart(2, '0');
                
                // Convert month number to Indonesian month name
                const monthNames = [
                    'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
                    'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
                ];
                const monthName = monthNames[parseInt(monthNum) - 1] || monthNum;
                
                const category = invoice.keterangan === 'PPN' ? 'PPN' : 'NON';
                const location = extractLocationFromToko(invoice.toko);
                
                // Path structure: /ARSIPINVOICE/LOCATION/TAHUN/BULAN/TANGGAL/CATEGORY/
                // LOCATION: BEKASI or PEMALANG (extracted from TOKO column)
                console.log(`[Invoice PDF] Path components - Location: ${location}, Year: ${year}, Month: ${monthName}, Day: ${day}, Category: ${category}`);
                console.log(`[Invoice PDF] Invoice keterangan: "${invoice.keterangan}" → Category: "${category}"`);
                
                // Build expected new path with location
                const expectedNewPath = `ARSIPINVOICE/${location}/${year}/${monthName}/${day}/${category}/${filename}`;
                console.log(`[Invoice PDF] Expected new path: ${expectedNewPath}`);
                console.log(`[Invoice PDF] Current DB path: ${invoice.invoice_pdf_path || 'NULL'}`);
                
                // Check if this is a re-upload of same file (path already matches new structure)
                const isReuploadWithNewPath = invoice.invoice_pdf_path === expectedNewPath;
                if (isReuploadWithNewPath) {
                    console.log(`[Invoice PDF] ℹ️  File already uploaded with new location-based path, allowing re-upload`);
                } else {
                    // QUICK CHECK: If existing file in DB, verify file truly exists before rejecting
                    // Only reject if file ACTUALLY exists in R2 (true duplicate)
                    if (invoice.invoice_pdf_path || invoice.uploaded_file_path) {
                        const pathToCheck = invoice.invoice_pdf_path || invoice.uploaded_file_path;
                        console.log(`[Invoice PDF] Checking if existing path still exists in R2: ${pathToCheck}`);
                        try {
                            const existsInR2 = await R2Storage.checkFileExistsNoCache(pathToCheck);
                            console.log(`[Invoice PDF] Duplicate check result: ${existsInR2 ? 'EXISTS - REJECT' : 'MISSING - ALLOW'}`);
                            if (existsInR2) {
                                // File truly exists in R2 - this is a real duplicate, reject
                                console.warn(`[Invoice PDF] File truly exists in R2: ${pathToCheck}`);
                                return res.status(409).json({
                                    error: 'File sudah ada (Duplicate)',
                                    message: `Invoice PDF sudah ada di R2`,
                                    existing_path: pathToCheck,
                                    faktur: faktur
                                });
                            } else {
                                // Old path in DB but file doesn't exist in R2
                                // This is a re-upload scenario - allow it
                                console.log(`[Invoice PDF] Old path not found in R2 - allowing re-upload`);
                            }
                        } catch (checkErr) {
                            // Check failed - be lenient, allow upload to proceed
                            console.warn(`[Invoice PDF] Quick check error (allowing re-upload):`, checkErr.message);
                        }
                    }
                }
                
                // OPTIMIZATION: Move upload to background (NON-BLOCKING)
                // Return response immediately with upload status, actual upload happens async
                const performUpload = async () => {
                    try {
                        console.log(`[Invoice PDF BG] Starting upload for faktur: ${faktur}`);
                        let uploadResult = null;
                        let remotePath = null;
                        
                        try {
                            console.log(`[Invoice PDF BG] Uploading file buffer (${fileBuffer.length} bytes)`);
                            
                            uploadResult = await R2Storage.uploadInvoicePDF(fileBuffer, filename, year, monthName, day, category, location);
                            
                            console.log(`[Invoice PDF BG] uploadResult:`, JSON.stringify(uploadResult, null, 2));
                            
                            // uploadResult is valid if it has storagePath (upload succeeded)
                            if (!uploadResult || !uploadResult.storagePath) {
                                throw new Error(uploadResult?.error || 'Upload failed');
                            }
                            
                            console.log(`[Invoice PDF BG] ✅ File uploaded to R2: ${remotePath || uploadResult.storagePath || uploadResult.path}`);
                        } catch (uploadErr) {
                            console.error(`[Invoice PDF BG] Upload error:`, uploadErr.message);
                            remotePath = uploadResult?.storagePath || uploadResult?.path || null;
                        }
                        
                        // Update invoice status in database - try NEW invoice_files table first
                        console.log('[Invoice PDF BG] Updating invoice path in database...');
                        let updateSuccess = false;
                        
                        try {
                            console.log(`[Invoice PDF BG] Attempting REST API INSERT into invoice_files...`);
                            
                            // Try NEW invoice_files table via REST API
                            const insertUrl = `${process.env.SUPABASE_URL}/rest/v1/invoice_files`;
                            const insertResponse = await fetch(insertUrl, {
                                method: 'POST',
                                headers: {
                                    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                                    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                                    'Content-Type': 'application/json',
                                    'Prefer': 'resolution=merge-duplicates'
                                },
                                body: JSON.stringify({
                                    faktur: faktur,
                                    file_type: 'invoice',
                                    file_path: remotePath,
                                    uploaded_at: new Date().toISOString(),
                                    uploaded_by: req.user.id
                                })
                            });
                            
                            if (insertResponse.ok) {
                                console.log(`[Invoice PDF BG] ✅ Inserted into invoice_files table (REST API)`);
                                updateSuccess = true;
                            } else {
                                const errText = await insertResponse.text();
                                console.log(`[Invoice PDF BG] REST API INSERT failed (${insertResponse.status}):`, errText.substring(0, 100));
                            }
                        } catch (restErr) {
                            console.log(`[Invoice PDF BG] REST API INSERT error:`, restErr.message?.substring(0, 50));
                        }
                        
                        // Fallback: Try standard upsert
                        if (!updateSuccess) {
                            try {
                                const { error: upsertErr } = await supabase
                                    .from('invoice_files')
                                    .upsert({
                                        faktur: faktur,
                                        file_type: 'invoice',
                                        file_path: remotePath,
                                        uploaded_at: new Date().toISOString(),
                                        uploaded_by: req.user.id
                                    });
                                
                                if (!upsertErr) {
                                    console.log(`[Invoice PDF BG] ✅ Upserted into invoice_files table`);
                                    updateSuccess = true;
                                } else {
                                    console.log(`[Invoice PDF BG] Upsert failed:`, upsertErr.message?.substring(0, 50));
                                }
                            } catch (upsertCatchErr) {
                                console.log(`[Invoice PDF BG] Upsert catch error`);
                            }
                        }
                        
                        // Final fallback: OLD method - update uploaded_file_path via REST API
                        if (!updateSuccess) {
                            try {
                                const updateUrl = `${process.env.SUPABASE_URL}/rest/v1/invoice_file_list?faktur=eq.${faktur}`;
                                const updateResponse = await fetch(updateUrl, {
                                    method: 'PATCH',
                                    headers: {
                                        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                                        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                                        'Content-Type': 'application/json',
                                        'Prefer': 'return=representation'
                                    },
                                    body: JSON.stringify({
                                        invoice_pdf_path: remotePath || null,
                                        uploaded_file_path: remotePath || null,  // Keep for backward compat
                                        uploaded_at: new Date().toISOString(),
                                        uploaded_by: req.user.id,
                                        updated_at: new Date().toISOString()
                                    })
                                });

                                if (updateResponse.ok) {
                                    console.log(`[Invoice PDF BG] ✅ Updated uploaded_file_path (OLD method)`);
                                    updateSuccess = true;
                                } else {
                                    const errorText = await updateResponse.text();
                                    console.error(`[Invoice PDF BG] Update failed (${updateResponse.status}):`, errorText.substring(0, 100));
                                }
                            } catch (updateErr) {
                                console.error('[Invoice PDF BG] Update error:', updateErr.message);
                            }
                        }
                        
                        if (updateSuccess) {
                            console.log(`[Invoice PDF BG] ✅ Database updated for faktur: ${faktur}`);
                            console.log(`[Invoice PDF BG] Stored path: ${remotePath || 'NULL'}`);
                            
                            // Update files_uploaded_count (includes internal delay for consistency)
                            const uploadedCount = await updateFilesUploadedCount(supabase, faktur, R2Storage);
                            console.log(`[Invoice PDF BG] Files uploaded count: ${uploadedCount}`);
                        } else {
                            console.error(`[Invoice PDF BG] ✗ All database update methods failed!`);
                        }
                    } catch (bgErr) {
                        console.error(`[Invoice PDF BG] Background upload error (non-blocking):`, bgErr.message);
                    }
                };
                
                // Start background upload but DON'T wait for it
                setImmediate(() => performUpload());
                
                // Return response immediately to client (with WhatsApp data)
                res.json({
                    success: true,
                    message: `File upload started for faktur: ${faktur} (processing in background)`,
                    faktur,
                    status: 'processing',
                    konsumen: invoice.konsumen,
                    total: invoice.total_jumlah_jual,
                    // WhatsApp data
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
    app.post('/api/invoice/upload-document',
        ...createAuth(['super_admin', 'moderator']),
        upload.single('file'),
        handleMulterError,
        async (req, res) => {
            try {
                if (!req.file) {
                    return res.status(400).json({ error: 'File PDF wajib diupload' });
                }

                const fileBuffer = req.file.buffer;
                const filename = req.file.originalname;
                const fileType = req.body.type || 'bukti_bayar';

                console.log(`[Invoice Document] Processing ${fileType}: ${filename}`);

                // Handle based on type
                if (fileType === 'faktur_pajak') {
                    // FAKTUR PAJAK FLOW
                    console.log(`[Invoice Document] Handling as FAKTUR PAJAK`);
                    
                    // Validate filename format: must start with "tax-" and end with ".pdf"
                    // Handle double .pdf extension
                    let cleanFilename = filename.replace(/\.pdf\.pdf$/i, '.pdf');
                    
                    const filenamePattern = /^tax-(.+)\.pdf$/i;
                    const match = cleanFilename.match(filenamePattern);

                    if (!match) {
                        console.log(`[Invoice Document] Invalid faktur pajak format: ${filename}`);
                        return res.status(400).json({
                            success: false,
                            error: 'ERROR : Format Nama File Tidak Sesuai'
                        });
                    }

                    const filenameParts = match[1]; // Everything between "tax-" and ".pdf"
                    
                    // Extract faktur number (first numeric part)
                    const fakturMatch = filenameParts.match(/^(\d+)/);
                    const fakturNumber = fakturMatch ? fakturMatch[1] : null;

                    if (!fakturNumber) {
                        console.log(`[Invoice Document] Could not extract faktur number`);
                        return res.status(400).json({
                            success: false,
                            error: 'ERROR : Format Nama File Tidak Sesuai'
                        });
                    }

                    console.log(`[Invoice Document] Extracted faktur: ${fakturNumber}`);

                    // Fetch invoice data to get the correct date
                    const { data: invoice, error: invoiceError } = await supabase
                        .from('invoice_file_list')
                        .select('tanggal, faktur_pajak_path')
                        .eq('faktur', fakturNumber)
                        .single();

                    if (invoiceError || !invoice) {
                        console.warn(`[Invoice Document] Invoice not found for faktur: ${fakturNumber}, using today's date`);
                    }
                    
                    const invoiceDate = invoice?.tanggal ? new Date(invoice.tanggal) : new Date();
                    const year = invoiceDate.getFullYear().toString();
                    const month = String(invoiceDate.getMonth() + 1).padStart(2, '0');
                    const day = String(invoiceDate.getDate()).padStart(2, '0');

                    const monthNames = [
                        'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
                        'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
                    ];
                    const monthName = monthNames[parseInt(month) - 1];

                    const finalFilename = cleanFilename;
                    const location = extractLocationFromToko(invoice?.toko);
                    console.log(`[Invoice Document] Path: /ARSIP/${location}/FAKTURPAJAK/${year}/${monthName}/${day}/${finalFilename}`);

                    // Build expected new path with location
                    const expectedNewPath = `ARSIP/${location}/FAKTURPAJAK/${year}/${monthName}/${day}/${finalFilename}`;
                    
                    // Check if this is a re-upload of same file (path already matches new structure)
                    const isReuploadWithNewPath = invoice?.faktur_pajak_path === expectedNewPath;
                    if (isReuploadWithNewPath) {
                        console.log(`[Invoice Document] ℹ️  Faktur Pajak already uploaded with new location-based path, allowing re-upload`);
                    } else {
                        // QUICK CHECK: If existing path in DB, verify it still exists before rejecting
                        if (invoice && invoice.faktur_pajak_path) {
                            try {
                                const existsInGDrive = await R2Storage.checkFileExistsNoCache(invoice.faktur_pajak_path);
                                if (existsInGDrive) {
                                    // File truly exists in Google Drive - reject as duplicate
                                    console.warn(`[Invoice Document] File already exists in Google Drive: ${invoice.faktur_pajak_path}`);
                                    return res.status(409).json({
                                        error: 'File sudah ada (Duplicate)',
                                        message: `Faktur Pajak sudah ada di Google Drive`,
                                        existing_path: invoice.faktur_pajak_path,
                                        faktur: fakturNumber
                                    });
                                } else {
                                    // Old path not found in GDrive - this is a re-upload
                                    // Allow the upload to proceed without clearing the path
                                    // The background upload will handle updating with new path
                                    console.log(`[Invoice Document] Old path not in GDrive - allowing re-upload`);
                                }
                            } catch (checkErr) {
                                // Check failed - be lenient, allow upload to proceed
                                console.warn(`[Invoice Document] Quick check error (allowing re-upload):`, checkErr.message);
                            }
                        }
                        
                        // Note: Do NOT clear path here - let background upload properly update it
                    }

                    // OPTIMIZATION: Move upload to background (NON-BLOCKING)
                    const performUpload = async () => {
                        let uploadResult = null;
                        try {
                            console.log(`[Invoice Document BG] Uploading FAKTUR PAJAK file buffer (${fileBuffer.length} bytes)`);
                            
                            uploadResult = await R2Storage.uploadDocumentFile(
                                fileBuffer,
                                finalFilename,
                                year,
                                monthName,
                                day,
                                'Faktur-Pajak',
                                location
                            );

                            console.log(`[Invoice Document BG] uploadResult:`, JSON.stringify(uploadResult, null, 2));

                            // uploadResult is valid if it has storagePath (upload succeeded)
                            if (!uploadResult || !uploadResult.storagePath) {
                                throw new Error(uploadResult?.error || 'Upload failed');
                            }

                            console.log(`[Invoice Document BG] ✅ Faktur Pajak uploaded: ${uploadResult.storagePath}`);
                            
                            // Update database - try NEW invoice_files table first using REST API
                            let updateSuccess = false;
                            try {
                                console.log(`[Invoice Document BG] Attempting REST API INSERT into invoice_files...`);
                                
                                const insertUrl = `${process.env.SUPABASE_URL}/rest/v1/invoice_files`;
                                const insertResponse = await fetch(insertUrl, {
                                    method: 'POST',
                                    headers: {
                                        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                                        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                                        'Content-Type': 'application/json',
                                        'Prefer': 'resolution=merge-duplicates'
                                    },
                                    body: JSON.stringify({
                                        faktur: fakturNumber,
                                        file_type: 'faktur_pajak',
                                        file_path: uploadResult.storagePath,
                                        uploaded_at: new Date().toISOString(),
                                        uploaded_by: req.user.id
                                    })
                                });
                                
                                if (insertResponse.ok) {
                                    console.log(`[Invoice Document BG] ✅ Inserted into invoice_files table (REST API)`);
                                    updateSuccess = true;
                                } else {
                                    const errText = await insertResponse.text();
                                    console.log(`[Invoice Document BG] REST API INSERT failed (${insertResponse.status}):`, errText.substring(0, 200));
                                }
                            } catch (restErr) {
                                console.log(`[Invoice Document BG] REST API INSERT error:`, restErr.message);
                            }
                            
                            // Fallback: Try standard upsert
                            if (!updateSuccess) {
                                try {
                                    console.log(`[Invoice Document BG] Trying standard upsert...`);
                                    const { error: upsertErr } = await supabase
                                        .from('invoice_files')
                                        .upsert({
                                            faktur: fakturNumber,
                                            file_type: 'faktur_pajak',
                                            file_path: uploadResult.storagePath,
                                            uploaded_at: new Date().toISOString(),
                                            uploaded_by: req.user.id
                                        });
                                    
                                    if (!upsertErr) {
                                        console.log(`[Invoice Document BG] ✅ Upserted into invoice_files table`);
                                        updateSuccess = true;
                                    } else {
                                        console.log(`[Invoice Document BG] Upsert failed:`, upsertErr.message);
                                    }
                                } catch (upsertCatchErr) {
                                    console.log(`[Invoice Document BG] Upsert catch error:`, upsertCatchErr.message);
                                }
                            }
                            
                            // Final fallback: OLD method - update uploaded_file_path AND faktur_pajak_path
                            if (!updateSuccess) {
                                try {
                                    console.log(`[Invoice Document BG] Trying OLD method (faktur_pajak_path & uploaded_file_path)...`);
                                    const { error: updateError } = await supabase
                                        .from('invoice_file_list')
                                        .update({
                                            faktur_pajak_path: uploadResult.storagePath,
                                            uploaded_file_path: uploadResult.storagePath,  // Keep for backward compatibility
                                            uploaded_at: new Date().toISOString(),
                                            updated_at: new Date().toISOString(),
                                            uploaded_by: req.user.id
                                        })
                                        .eq('faktur', fakturNumber);
                                    
                                    if (!updateError) {
                                        console.log(`[Invoice Document BG] ✅ Updated uploaded_file_path (OLD method)`);
                                        updateSuccess = true;
                                    } else {
                                        console.log(`[Invoice Document BG] OLD method failed:`, updateError.message);
                                    }
                                } catch (oldErr) {
                                    console.log(`[Invoice Document BG] OLD method error:`, oldErr.message);
                                }
                            }
                            
                            // Always try to update count, even if database update failed
                            // The function scans R2 directly, which is the source of truth
                            try {
                                await updateFilesUploadedCount(supabase, fakturNumber, R2Storage);
                            } catch (countErr) {
                                console.error(`[Invoice Document BG] Error updating count:`, countErr.message);
                            }
                        } catch (uploadErr) {
                            console.error(`[Invoice Document BG] Upload error:`, uploadErr.message);
                            console.error(`[Invoice Document BG] Error stack:`, uploadErr.stack);
                        }
                    };
                    
                    // Start background upload but DON'T wait for it
                    setImmediate(() => performUpload());
                    
                    // Return response immediately to client
                    res.json({
                        success: true,
                        message: 'Faktur pajak upload started (processing in background)',
                        type: 'faktur_pajak',
                        originalName: filename,
                        status: 'processing',
                        faktur: fakturNumber
                    });

                } else {
                    // BUKTI BAYAR FLOW (default)
                    console.log(`[Invoice Document] Handling as BUKTI BAYAR`);
                    
                    // Extract nomor faktur from filename (remove .pdf extensions)
                    let nomorFaktur = filename.replace(/\.pdf\.pdf$/i, '.pdf').replace(/\.pdf$/i, '').trim();

                    if (!/^\d+$/.test(nomorFaktur)) {
                        console.log(`[Invoice Document] Invalid bukti bayar format: ${filename}`);
                        return res.status(400).json({
                            success: false,
                            error: 'Nama file harus berupa nomor faktur'
                        });
                    }

                    // Fetch invoice data to get the correct date
                    const { data: invoice, error: invoiceError } = await supabase
                        .from('invoice_file_list')
                        .select('tanggal, toko')
                        .eq('faktur', nomorFaktur)
                        .single();

                    if (invoiceError || !invoice) {
                        console.warn(`[Invoice Document] Invoice not found for faktur: ${nomorFaktur}, using today's date`);
                    }
                    
                    const invoiceDate = invoice?.tanggal ? new Date(invoice.tanggal) : new Date();
                    const year = invoiceDate.getFullYear().toString();
                    const month = String(invoiceDate.getMonth() + 1).padStart(2, '0');
                    const day = String(invoiceDate.getDate()).padStart(2, '0');

                    const monthNames = [
                        'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
                        'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
                    ];
                    const monthName = monthNames[parseInt(month) - 1];

                    const finalFilename = `${nomorFaktur}.pdf`;
                    const location = extractLocationFromToko(invoice?.toko);

                    console.log(`[Invoice Document] Path: /ARSIP/${location}/BUKTIBAYAR/${year}/${monthName}/${day}/${finalFilename}`);

                    // Build expected new path with location
                    const expectedNewPath = `ARSIP/${location}/BUKTIBAYAR/${year}/${monthName}/${day}/${finalFilename}`;
                    
                    // Check if this is a re-upload of same file (path already matches new structure)
                    const isReuploadWithNewPath = invoice?.bukti_bayar_path === expectedNewPath;
                    if (isReuploadWithNewPath) {
                        console.log(`[Invoice Document] ℹ️  Bukti Bayar already uploaded with new location-based path, allowing re-upload`);
                    } else {
                        // QUICK CHECK: If existing path in DB, verify it still exists before rejecting
                        if (invoice && invoice.bukti_bayar_path) {
                            try {
                                const existsInGDrive = await R2Storage.checkFileExistsNoCache(invoice.bukti_bayar_path);
                                if (existsInGDrive) {
                                    // File truly exists in Google Drive - reject as duplicate
                                    console.warn(`[Invoice Document] File already exists in Google Drive: ${invoice.bukti_bayar_path}`);
                                    return res.status(409).json({
                                        error: 'File sudah ada (Duplicate)',
                                        message: `Bukti Bayar sudah ada di Google Drive`,
                                        existing_path: invoice.bukti_bayar_path,
                                        faktur: nomorFaktur
                                    });
                                } else {
                                    // Old path not found in GDrive - this is a re-upload
                                    // Allow the upload to proceed without clearing the path
                                    // The background upload will handle updating with new path
                                    console.log(`[Invoice Document] Old path not in GDrive - allowing re-upload`);
                                }
                            } catch (checkErr) {
                                // Check failed - be lenient, allow upload to proceed
                                console.warn(`[Invoice Document] Quick check error (allowing re-upload):`, checkErr.message);
                            }
                        }
                        
                        // Note: Do NOT clear path here - let background upload properly update it
                    }

                    // OPTIMIZATION: Move upload to background (NON-BLOCKING)
                    const performUpload = async () => {
                        let uploadResult = null;
                        try {
                            console.log(`[Invoice Document BG] Uploading BUKTI BAYAR file buffer (${fileBuffer.length} bytes)`);
                            
                            uploadResult = await R2Storage.uploadDocumentFile(
                                fileBuffer,
                                finalFilename,
                                year,
                                monthName,
                                day,
                                'bukti-bayar',
                                location
                            );

                            console.log(`[Invoice Document BG] uploadResult:`, JSON.stringify(uploadResult, null, 2));

                            // uploadResult is valid if it has storagePath (upload succeeded)
                            if (!uploadResult || !uploadResult.storagePath) {
                                throw new Error(uploadResult?.error || 'Upload failed');
                            }

                            console.log(`[Invoice Document BG] ✅ Bukti Bayar uploaded: ${uploadResult.storagePath}`);
                            
                            // Update database - try NEW invoice_files table first using REST API
                            let updateSuccess = false;
                            try {
                                console.log(`[Invoice Document BG] Attempting REST API INSERT into invoice_files...`);
                                
                                const insertUrl = `${process.env.SUPABASE_URL}/rest/v1/invoice_files`;
                                const insertResponse = await fetch(insertUrl, {
                                    method: 'POST',
                                    headers: {
                                        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                                        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                                        'Content-Type': 'application/json',
                                        'Prefer': 'resolution=merge-duplicates'
                                    },
                                    body: JSON.stringify({
                                        faktur: nomorFaktur,
                                        file_type: 'bukti_bayar',
                                        file_path: uploadResult.storagePath,
                                        uploaded_at: new Date().toISOString(),
                                        uploaded_by: req.user.id
                                    })
                                });
                                
                                if (insertResponse.ok) {
                                    console.log(`[Invoice Document BG] ✅ Inserted into invoice_files table (REST API)`);
                                    updateSuccess = true;
                                } else {
                                    const errText = await insertResponse.text();
                                    console.log(`[Invoice Document BG] REST API INSERT failed (${insertResponse.status}):`, errText.substring(0, 200));
                                }
                            } catch (restErr) {
                                console.log(`[Invoice Document BG] REST API INSERT error:`, restErr.message);
                            }
                            
                            // Fallback: Try standard upsert
                            if (!updateSuccess) {
                                try {
                                    console.log(`[Invoice Document BG] Trying standard upsert...`);
                                    const { error: upsertErr } = await supabase
                                        .from('invoice_files')
                                        .upsert({
                                            faktur: nomorFaktur,
                                            file_type: 'bukti_bayar',
                                            file_path: uploadResult.storagePath,
                                            uploaded_at: new Date().toISOString(),
                                            uploaded_by: req.user.id
                                        });
                                    
                                    if (!upsertErr) {
                                        console.log(`[Invoice Document BG] ✅ Upserted into invoice_files table`);
                                        updateSuccess = true;
                                    } else {
                                        console.log(`[Invoice Document BG] Upsert failed:`, upsertErr.message);
                                    }
                                } catch (upsertCatchErr) {
                                    console.log(`[Invoice Document BG] Upsert catch error:`, upsertCatchErr.message);
                                }
                            }
                            
                            // Final fallback: OLD method - update uploaded_file_path AND bukti_bayar_path
                            if (!updateSuccess) {
                                try {
                                    console.log(`[Invoice Document BG] Trying OLD method (bukti_bayar_path & uploaded_file_path)...`);
                                    const { error: updateError } = await supabase
                                        .from('invoice_file_list')
                                        .update({
                                            bukti_bayar_path: uploadResult.storagePath,
                                            uploaded_file_path: uploadResult.storagePath,  // Keep for backward compatibility
                                            uploaded_at: new Date().toISOString(),
                                            uploaded_by: req.user.id
                                        })
                                        .eq('faktur', nomorFaktur);

                                    if (!updateError) {
                                        console.log(`[Invoice Document BG] ✅ Updated uploaded_file_path (OLD method)`);
                                        updateSuccess = true;
                                    } else {
                                        console.log(`[Invoice Document BG] OLD method failed:`, updateError.message);
                                    }
                                } catch (oldErr) {
                                    console.log(`[Invoice Document BG] OLD method error:`, oldErr.message);
                                }
                            }
                            
                            // Always try to update count, even if database update failed
                            // The function scans R2 directly, which is the source of truth
                            try {
                                await updateFilesUploadedCount(supabase, nomorFaktur, R2Storage);
                            } catch (countErr) {
                                console.error(`[Invoice Document BG] Error updating count:`, countErr.message);
                            }
                        } catch (uploadErr) {
                            console.error(`[Invoice Document BG] Upload error:`, uploadErr.message);
                            console.error(`[Invoice Document BG] Error stack:`, uploadErr.stack);
                        }
                    };
                    
                    // Start background upload but DON'T wait for it
                    setImmediate(() => performUpload());
                    
                    // Return response immediately to client
                    res.json({
                        success: true,
                        message: 'Bukti bayar upload started (processing in background)',
                        type: 'bukti_bayar',
                        originalName: filename,
                        status: 'processing',
                        faktur: nomorFaktur
                    });
                }

            } catch (error) {
                console.error('[Invoice Document] Error:', error.message);
                res.status(500).json({
                    success: false,
                    error: 'Server error: ' + error.message
                });
            }
        }
    );

    // ============================================
    // POST /api/invoice/upload-faktur-pajak
    // Upload Faktur Pajak - filename detection only
    // Filename must match format: tax-REFERENSI NAMA NOMINAL.pdf
    // Example: tax-835100310232 SEMESTA GEMILANG CILEGON 2.393.000.pdf
    // Path: /ARSIPINVOICE/ARSIPINVOICE/TAHUN/BULAN/TANGGAL/FAKTURPAJAK/
    // ============================================
    app.post('/api/invoice/upload-faktur-pajak',
        ...createAuth(['super_admin', 'moderator']),
        upload.single('file'),
        handleMulterError,
        async (req, res) => {
            try {
                if (!req.file) {
                    return res.status(400).json({ error: 'File PDF wajib diupload' });
                }

                const fileBuffer = req.file.buffer;
                const filename = req.file.originalname;

                console.log(`[Invoice Faktur Pajak] Processing: ${filename}`);

                // Validate filename format: must start with "tax-" and end with ".pdf"
                const filenamePattern = /^tax-(.+)\.pdf$/i;
                const match = filename.match(filenamePattern);

                if (!match) {
                    return res.status(400).json({
                        success: false,
                        error: 'Format nama file tidak sesuai. Harus: tax-REFERENSI NAMA NOMINAL.pdf',
                        example: 'tax-835100310232 SEMESTA GEMILANG CILEGON 2.393.000.pdf'
                    });
                }

                const filenameParts = match[1]; // Everything between "tax-" and ".pdf"
                
                // Extract faktur/referensi number (first part before space)
                // Example: "835100310232 SEMESTA GEMILANG 2.393.000" -> "835100310232"
                const fakturMatch = filenameParts.match(/^(\d+)/);
                const fakturNumber = fakturMatch ? fakturMatch[1] : null;

                console.log(`[Invoice Faktur Pajak] Extracted faktur: ${fakturNumber}`);

                // Fetch invoice data to get the correct date
                const { data: invoice, error: invoiceError } = await supabase
                    .from('invoice_file_list')
                    .select('tanggal, toko')
                    .eq('faktur', fakturNumber)
                    .single();

                if (invoiceError || !invoice) {
                    console.warn(`[Invoice Faktur Pajak] Invoice not found for faktur: ${fakturNumber}, using today's date`);
                }
                
                // Check if Faktur Pajak has already been uploaded (move checks to background)
                const performBackgroundChecks = async () => {
                    if (invoice && invoice.faktur_pajak_path) {
                        // File path exists in database, but verify it still exists on Google Drive
                        try {
                            console.log(`[Invoice Faktur Pajak BG] Verifying if file still exists on Google Drive: ${invoice.faktur_pajak_path}`);
                            const fileExists = await R2Storage.checkFileExistsNoCache(invoice.faktur_pajak_path);
                            
                            if (fileExists) {
                                console.log(`[Invoice Faktur Pajak BG] ✓ File still exists on Google Drive`);
                            } else {
                                console.log(`[Invoice Faktur Pajak BG] ✓ File was deleted from Google Drive`);
                            }
                        } catch (verifyErr) {
                            console.warn(`[Invoice Faktur Pajak BG] Error verifying file on Google Drive:`, verifyErr.message);
                        }
                    }
                    
                    // Check if file already exists (duplicate detection)
                    const fakturUploadPath = expectedNewPath;
                    try {
                        const fileExists = await R2Storage.checkFileExistsNoCache(fakturUploadPath);
                        if (fileExists && !isReuploadWithNewPath) {
                            console.log(`[Invoice Faktur Pajak BG] ✓ Duplicate file detected at: ${fakturUploadPath}`);
                        } else {
                            console.log(`[Invoice Faktur Pajak BG] ✓ No duplicate found`);
                        }
                    } catch (checkErr) {
                        console.warn(`[Invoice Faktur Pajak BG] Error checking duplicate: ${checkErr.message}`);
                    }
                };
                
                // Start background checks but DON'T wait for them
                setImmediate(() => performBackgroundChecks());

                // Use invoice date if available, otherwise use today's date
                const invoiceDate = invoice?.tanggal ? new Date(invoice.tanggal) : new Date();
                const year = invoiceDate.getFullYear().toString();
                const month = String(invoiceDate.getMonth() + 1).padStart(2, '0');
                const day = String(invoiceDate.getDate()).padStart(2, '0');

                const monthNames = [
                    'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
                    'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
                ];
                const monthName = monthNames[parseInt(month) - 1];

                // Keep filename as-is (already in correct format)
                const finalFilename = filename;
                const location = extractLocationFromToko(invoice?.toko);

                console.log(`[Invoice Faktur Pajak] Path: /ARSIP/${location}/FAKTURPAJAK/${year}/${monthName}/${day}/${finalFilename}`);

                // Build expected new path with location
                const expectedNewPath = `ARSIP/${location}/FAKTURPAJAK/${year}/${monthName}/${day}/${finalFilename}`;
                
                // Check if this is a re-upload of same file (path already matches new structure)
                const isReuploadWithNewPath = invoice?.faktur_pajak_path === expectedNewPath;
                
                if (!isReuploadWithNewPath && invoice?.faktur_pajak_path) {
                    // QUICK CHECK: If existing OLD path in DB, verify file truly exists before rejecting
                    // Only reject if file ACTUALLY exists in GDrive (true duplicate)
                    // Don't clear path here - let the upload process handle it
                    try {
                        const existsInGDrive = await R2Storage.checkFileExistsNoCache(invoice.faktur_pajak_path);
                        if (existsInGDrive) {
                            // File truly exists in Google Drive - this is a real duplicate, reject
                            console.warn(`[Invoice Faktur Pajak] File truly exists in Google Drive: ${invoice.faktur_pajak_path}`);
                            return res.status(409).json({
                                error: 'File sudah ada (Duplicate)',
                                message: `Faktur Pajak sudah ada di Google Drive`,
                                existing_path: invoice.faktur_pajak_path,
                                faktur: fakturNumber
                            });
                        } else {
                            // Old path in DB but file doesn't exist in GDrive
                            // This is a re-upload scenario - allow it
                            console.log(`[Invoice Faktur Pajak] Old path not found in GDrive - allowing re-upload`);
                        }
                    } catch (checkErr) {
                        // Check failed - be lenient, allow upload to proceed
                        console.warn(`[Invoice Faktur Pajak] Quick check error (allowing re-upload):`, checkErr.message);
                    }
                }

                // OPTIMIZATION: Move upload to background (NON-BLOCKING)
                const performUpload = async () => {
                    let uploadResult = null;
                    try {
                        console.log(`[Invoice Faktur Pajak BG] Uploading file buffer (${fileBuffer.length} bytes)`);
                        
                        uploadResult = await R2Storage.uploadDocumentFile(
                            fileBuffer,
                            finalFilename,
                            year,
                            monthName,
                            day,
                            'FAKTURPAJAK',
                            location
                        );

                        if (!uploadResult.success) {
                            throw new Error(uploadResult.error || 'Upload failed');
                        }

                        console.log(`[Invoice Faktur Pajak BG] ✅ File uploaded: ${uploadResult.path}`);
                        
                        // Update database - track faktur pajak path
                        if (fakturNumber) {
                            try {
                                const { error: updateError } = await supabase
                                    .from('invoice_file_list')
                                    .update({
                                        faktur_pajak_path: uploadResult.path,
                                        faktur_pajak_uploaded_at: new Date().toISOString(),
                                        updated_at: new Date().toISOString(),
                                        uploaded_by: req.user.id
                                    })
                                    .eq('faktur', fakturNumber);

                                if (updateError) {
                                    console.error('[Invoice Faktur Pajak BG] Update error:', updateError);
                                } else {
                                    console.log(`[Invoice Faktur Pajak BG] ✅ Database updated for faktur: ${fakturNumber}`);
                                }
                                
                                // Always update count regardless of database success
                                // The function scans R2 directly, which is the source of truth
                                try {
                                    await updateFilesUploadedCount(supabase, fakturNumber, R2Storage);
                                } catch (countErr) {
                                    console.error(`[Invoice Faktur Pajak BG] Error updating count:`, countErr.message);
                                }
                            } catch (dbErr) {
                                console.error('[Invoice Faktur Pajak BG] DB error:', dbErr.message);
                            }
                        }
                    } catch (uploadErr) {
                        console.error(`[Invoice Faktur Pajak BG] Upload error:`, uploadErr.message);
                    }
                };
                
                // Start background upload but DON'T wait for it
                setImmediate(() => performUpload());
                
                // Return response immediately to client
                res.json({
                    success: true,
                    message: 'Faktur pajak upload started (processing in background)',
                    faktur: fakturNumber,
                    status: 'processing'
                });

            } catch (error) {
                console.error('[Invoice Faktur Pajak] Error:', error.message);
                res.status(500).json({
                    success: false,
                    error: 'Server error: ' + error.message
                });
            }
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
                
                console.log(`[Invoice Download] ⏱️  Request for ${fileType} of faktur: ${faktur}`);
                
                // Validate fileType
                const validTypes = ['invoice', 'bukti_bayar', 'faktur_pajak'];
                if (!validTypes.includes(fileType)) {
                    return res.status(400).json({ 
                        error: 'Invalid file type',
                        validTypes: validTypes
                    });
                }
                
                // Get invoice data
                const queryStartTime = Date.now();
                const { data: invoice, error: queryError } = await supabase
                    .from('invoice_file_list')
                    .select('*')
                    .eq('faktur', faktur)
                    .single();
                
                const queryTime = Date.now() - queryStartTime;
                console.log(`[Invoice Download] DB query took ${queryTime}ms`);
                
                if (queryError || !invoice) {
                    return res.status(404).json({ error: `Invoice not found: ${faktur}` });
                }
                
                // Get file path based on type
                let filePath = null;
                
                // For now, all file types return the same uploaded_file_path since we only have one file per invoice
                // In the future this can be extended to support multiple files (bukti_bayar, faktur_pajak)
                filePath = invoice.uploaded_file_path;
                
                if (!filePath) {
                    return res.status(404).json({ 
                        error: `File not uploaded yet`,
                        fileType: fileType,
                        faktur: faktur
                    });
                }
                
                console.log(`[Invoice Download] File path: ${filePath}`);
                
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
                            // Cache valid if less than 24 hours old
                            if (Date.now() - stats.mtimeMs < 24 * 60 * 60 * 1000) {
                                fileBuffer = fs.readFileSync(cachedFilePath);
                                fromCache = true;
                                console.log(`[Invoice Download] ✅ Cache HIT: ${filePath.split('/').pop()} (${fileBuffer.length} bytes)`);
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
                        
                        fileBuffer = await R2Storage.downloadFile(filePath);
                        
                        const downloadTime = Date.now() - downloadStartTime;
                        console.log(`[Invoice Download] Rclone download took ${downloadTime}ms (${fileBuffer.length} bytes)`);
                        
                        // Save to cache for future requests
                        try {
                            fs.writeFileSync(cachedFilePath, fileBuffer);
                            console.log(`[Invoice Download] ✅ Cached for future requests`);
                        } catch (cacheWriteErr) {
                            console.warn(`[Invoice Download] Cache write failed (non-blocking):`, cacheWriteErr.message);
                        }
                    }
                    
                    // Extract filename from path
                    const filename = filePath.split('/').pop();
                    
                    // Set headers for PDF download
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                    res.setHeader('Content-Length', fileBuffer.length);
                    res.setHeader('Cache-Control', 'public, max-age=3600'); // Browser cache 1 hour
                    
                    // Send file
                    res.send(fileBuffer);
                    
                    const totalTime = Date.now() - startTime;
                    const source = fromCache ? 'CACHE' : 'RCLONE';
                    console.log(`[Invoice Download] ✅ Complete in ${totalTime}ms (${source})`);
                    
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
                
                console.log(`[Invoice Combine] ⏱️  Request for faktur: ${faktur}`);
                
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
                const fileListSignature = [
                    invoice.bukti_bayar_path,
                    invoice.invoice_pdf_path,
                    invoice.faktur_pajak_path
                ].filter(Boolean).join('|');
                
                const cacheKey = Buffer.from(fileListSignature).toString('hex');
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
                            console.log(`[Invoice Combine] ✅ Cache HIT: Combined PDF (${mergedBuffer.length} bytes)`);
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
                        console.log(`[Invoice Combine] ✅ Merged in ${mergeTime}ms: ${mergedBuffer.length} bytes`);
                        
                        // Save to cache for future requests
                        try {
                            fs.writeFileSync(cachedFilePath, mergedBuffer);
                            console.log(`[Invoice Combine] ✅ Cached for future requests`);
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
                console.log(`[Invoice Combine] ✅ Complete in ${totalTime}ms (${source})`);
                
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
                
                // Search for each file type in new location-based paths
                try {
                    // Search for invoice PDF
                    const invoiceSearchPath = `ARSIPINVOICE/${location}/${year}/${monthName}/${day}/${category}`;
                    console.log(`[Invoice Search] Searching invoice in: ${invoiceSearchPath}`);
                    const invoiceFiles = await R2Storage.listFiles(invoiceSearchPath);
                    const invoiceFile = invoiceFiles.find(f => f.name.includes(faktur) && f.name.endsWith('.pdf'));
                    if (invoiceFile && !invoiceFile.is_dir) {
                        const invoicePath = `ARSIPINVOICE/${location}/${year}/${monthName}/${day}/${category}/${invoiceFile.name}`;
                        foundFiles.invoice = invoicePath;
                        console.log(`[Invoice Search] Found invoice: ${invoicePath}`);
                    }
                } catch (err) {
                    console.log(`[Invoice Search] No invoice found (path may not exist):`, err.message);
                }
                
                try {
                    // Search for bukti bayar
                    const buktiSearchPath = `ARSIP/${location}/bukti-bayar/${year}/${monthName}/${day}`;
                    console.log(`[Invoice Search] Searching bukti bayar in: ${buktiSearchPath}`);
                    const buktiFiles = await R2Storage.listFiles(buktiSearchPath);
                    const buktiFile = buktiFiles.find(f => f.name.includes(faktur) && f.name.endsWith('.pdf'));
                    if (buktiFile && !buktiFile.is_dir) {
                        const buktiPath = `ARSIP/${location}/BUKTIBAYAR/${year}/${monthName}/${day}/${buktiFile.name}`;
                        foundFiles.bukti_bayar = buktiPath;
                        console.log(`[Invoice Search] Found bukti bayar: ${buktiPath}`);
                    }
                } catch (err) {
                    console.log(`[Invoice Search] No bukti bayar found:`, err.message);
                }
                
                try {
                    // Search for faktur pajak
                    const fakturSearchPath = `ARSIP/${location}/Faktur-Pajak/${year}/${monthName}/${day}`;
                    console.log(`[Invoice Search] Searching faktur pajak in: ${fakturSearchPath}`);
                    const fakturFiles = await R2Storage.listFiles(fakturSearchPath);
                    const fakturFile = fakturFiles.find(f => f.name.includes('tax-') && f.name.includes(faktur) && f.name.endsWith('.pdf'));
                    if (fakturFile && !fakturFile.is_dir) {
                        const fakturPath = `ARSIP/${location}/FAKTURPAJAK/${year}/${monthName}/${day}/${fakturFile.name}`;
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
                
                console.log(`[Invoice Update] ✅ Updated paths for faktur: ${faktur}`, updateData);
                
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
                        try {
                            const invoiceSearchPath = `ARSIPINVOICE/${location}/${year}/${monthName}/${day}/${category}`;
                            const invoiceFiles = await R2Storage.listFiles(invoiceSearchPath);
                            const invoiceFile = invoiceFiles.find(f => f.name.includes(invoice.faktur) && f.name.endsWith('.pdf'));
                            if (invoiceFile && !invoiceFile.is_dir) {
                                result.found.push('invoice');
                            }
                        } catch (err) {
                            // Path doesn't exist, continue
                        }
                        
                        try {
                            const buktiSearchPath = `ARSIP/${location}/bukti-bayar/${year}/${monthName}/${day}`;
                            const buktiFiles = await R2Storage.listFiles(buktiSearchPath);
                            const buktiFile = buktiFiles.find(f => f.name.includes(invoice.faktur) && f.name.endsWith('.pdf'));
                            if (buktiFile && !buktiFile.is_dir) {
                                result.found.push('bukti_bayar');
                            }
                        } catch (err) {
                            // Path doesn't exist, continue
                        }
                        
                        try {
                            const fakturSearchPath = `ARSIP/${location}/Faktur-Pajak/${year}/${monthName}/${day}`;
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
                
                console.log(`[Invoice Scan] ✅ Scanned ${invoices?.length || 0} invoices, found ${scanResults.length} with files`);
                
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
                
                if (!faktur || !fileType) {
                    return res.status(400).json({ error: 'Faktur and fileType are required' });
                }
                
                const validTypes = ['invoice_pdf', 'bukti_bayar', 'faktur_pajak'];
                if (!validTypes.includes(fileType)) {
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
                    return res.status(404).json({ error: `Invoice not found: ${faktur}` });
                }
                
                // Map fileType to column names
                const pathColumn = fileType === 'invoice_pdf' ? 'invoice_pdf_path' :
                                  fileType === 'bukti_bayar' ? 'bukti_bayar_path' :
                                  'faktur_pajak_path';
                
                const uploadedAtColumn = fileType === 'invoice_pdf' ? 'invoice_uploaded_at' :
                                        fileType === 'bukti_bayar' ? 'bukti_bayar_uploaded_at' :
                                        'faktur_pajak_uploaded_at';
                
                const oldPath = invoice[pathColumn];
                
                if (!oldPath) {
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
                    return res.status(500).json({ error: 'Failed to clear file path' });
                }
                
                // Recalculate files_uploaded_count
                let uploadedCount = 0;
                
                // Count existing files AFTER clearing the deleted one
                if (fileType !== 'invoice_pdf' && invoice.invoice_pdf_path) uploadedCount++;
                if (fileType !== 'bukti_bayar' && invoice.bukti_bayar_path) uploadedCount++;
                if (fileType !== 'faktur_pajak' && invoice.faktur_pajak_path) uploadedCount++;
                
                const { error: countErr } = await supabase
                    .from('invoice_file_list')
                    .update({
                        files_uploaded_count: uploadedCount,
                        updated_at: new Date().toISOString()
                    })
                    .eq('faktur', faktur);
                
                if (countErr) {
                    console.warn(`[ClearFile] Failed to update count:`, countErr);
                }
                
                console.log(`[ClearFile] ✅ Cleared ${fileType} for faktur ${faktur}. New count: ${uploadedCount}`);
                
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
                    console.log(`[FileExist Verify] ✅ Corrected ${faktur}: ${dbCount} → ${actualFilesExist}`);
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
                
                console.log('[ManualSync] ✅ Sync completed:', result);
                
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
    addManualSyncEndpoint
};
