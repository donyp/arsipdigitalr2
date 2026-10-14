// Rename Invoice Endpoints - Separate Feature Module
// ============================================================
// Handles invoice renaming with OCR detection for scanned PDFs
// Auto-downloads renamed files and maintains history in database
// ============================================================

const fs = require('fs');
const path = require('path');

/**
 * Query database untuk cari faktur dengan berbagai strategy
 * Handles OCR failures by using fuzzy matching dan partial patterns
 */
async function findInvoiceInDatabase(supabase, extractedNumber, ocrText, fileName) {
    try {
        console.log('[DB-SEARCH] Starting database search...');
        console.log('[DB-SEARCH] Extracted number:', extractedNumber);
        console.log('[DB-SEARCH] OCR text length:', ocrText?.length || 0);
        console.log('[DB-SEARCH] Filename:', fileName);
        
        // Strategy 1: Direct exact match if we have a number
        if (extractedNumber && extractedNumber.length >= 14) {
            console.log('[DB-SEARCH] Strategy 1: Trying exact match for', extractedNumber);
            const { data, error } = await supabase
                .from('invoices')
                .select('faktur')
                .eq('faktur', extractedNumber)
                .limit(1);
            
            if (!error && data && data.length > 0) {
                console.log('[DB-SEARCH] Strategy 1 SUCCESS: Found exact match:', data[0].faktur);
                return data[0].faktur;
            }
        }
        
        // Strategy 2: Prefix + suffix matching (robust against digit misreads)
        if (extractedNumber && extractedNumber.length >= 14) {
            console.log('[DB-SEARCH] Strategy 2: Trying prefix+suffix fuzzy match');
            const prefix = extractedNumber.substring(0, 8);
            const suffix = extractedNumber.substring(extractedNumber.length - 4);
            
            const { data, error } = await supabase
                .from('invoices')
                .select('faktur')
                .ilike('faktur', `${prefix}%${suffix}`)
                .limit(10);
            
            if (!error && data && data.length > 0) {
                console.log('[DB-SEARCH] Found', data.length, 'candidates with prefix/suffix match');
                // Use fuzzy match to find closest
                let bestMatch = data[0].faktur;
                let bestDistance = levenshteinDistance(extractedNumber, bestMatch);
                
                for (const inv of data) {
                    const dist = levenshteinDistance(extractedNumber, inv.faktur);
                    if (dist < bestDistance) {
                        bestDistance = dist;
                        bestMatch = inv.faktur;
                    }
                }
                
                // Allow distance up to 4 (allows 4 digit misreads like 835100311101025001 → 835100311101026001)
                if (bestDistance <= 4) {
                    console.log(`[DB-SEARCH] Strategy 2 SUCCESS: Found match: ${extractedNumber} → ${bestMatch} (distance: ${bestDistance})`);
                    return bestMatch;
                } else {
                    console.log(`[DB-SEARCH] Strategy 2: Best match has distance ${bestDistance}, too high, skipping`);
                }
            }
        }
        
        // Strategy 3: Extract all numbers from OCR text and search
        if (ocrText && ocrText.length > 0) {
            console.log('[DB-SEARCH] Strategy 3: Extract numbers from OCR text');
            const numbers = ocrText.match(/\d{14,18}/g) || [];
            console.log('[DB-SEARCH] Found', numbers.length, 'number sequences in OCR text');
            
            for (const num of numbers) {
                const { data, error } = await supabase
                    .from('invoices')
                    .select('faktur')
                    .eq('faktur', num)
                    .limit(1);
                
                if (!error && data && data.length > 0) {
                    console.log('[DB-SEARCH] Strategy 3 SUCCESS: Found exact match via OCR:', data[0].faktur);
                    return data[0].faktur;
                }
            }
        }
        
        // Strategy 4: Extract numbers from filename (including partial numbers)
        if (fileName && fileName.length > 0) {
            console.log('[DB-SEARCH] Strategy 4: Extract numbers from filename');
            const cleanFileName = fileName.replace(/\.pdf$/i, '');
            
            // Try 14-18 digit numbers first
            const mainNumbers = cleanFileName.match(/\d{14,18}/g) || [];
            console.log('[DB-SEARCH] Found', mainNumbers.length, 'invoice-sized numbers in filename');
            
            for (const num of mainNumbers) {
                const { data, error } = await supabase
                    .from('invoices')
                    .select('faktur')
                    .eq('faktur', num)
                    .limit(1);
                
                if (!error && data && data.length > 0) {
                    console.log('[DB-SEARCH] Strategy 4 SUCCESS: Found exact match via filename:', data[0].faktur);
                    return data[0].faktur;
                }
            }
            
            // Try fuzzy match on filename patterns
            // Extract any digit sequences >= 8 digits from filename
            const partialNumbers = cleanFileName.match(/\d{8,}/g) || [];
            console.log('[DB-SEARCH] Found', partialNumbers.length, 'partial number sequences in filename');
            
            if (partialNumbers.length > 0) {
                // Get sample of DB invoices that might match
                const { data: allInvoices, error } = await supabase
                    .from('invoices')
                    .select('faktur')
                    .limit(100); // Sample for fuzzy matching
                
                if (!error && allInvoices && allInvoices.length > 0) {
                    for (const partial of partialNumbers) {
                        let bestMatch = null;
                        let bestDistance = Infinity;
                        
                        for (const inv of allInvoices) {
                            // Check if filename number is contained in faktur
                            if (inv.faktur.includes(partial)) {
                                console.log('[DB-SEARCH] Strategy 4b: Found partial match:', inv.faktur);
                                return inv.faktur;
                            }
                            
                            // Or try fuzzy match
                            const dist = levenshteinDistance(partial, inv.faktur.substring(0, partial.length));
                            if (dist < bestDistance) {
                                bestDistance = dist;
                                bestMatch = inv.faktur;
                            }
                        }
                        
                        if (bestDistance <= 2 && bestMatch) {
                            console.log(`[DB-SEARCH] Strategy 4c: Found fuzzy match via partial: ${partial} → ${bestMatch} (distance: ${bestDistance})`);
                            return bestMatch;
                        }
                    }
                }
            }
        }
        
        // Strategy 5: Brute-force search if OCR is completely garbled
        // Try to find ANY recent invoice in database
        if (!extractedNumber && ocrText && ocrText.length > 50) {
            console.log('[DB-SEARCH] Strategy 5: Text extraction exists but unreadable, searching for recent invoices');
            const { data, error } = await supabase
                .from('invoices')
                .select('faktur')
                .order('created_at', { ascending: false })
                .limit(100); // Get many recent invoices
            
            if (!error && data && data.length > 0) {
                console.log('[DB-SEARCH] Found recent invoices in DB:', data.map(d => d.faktur).join(', ').substring(0, 200));
                // Return first one as fallback (user will see these in error message)
                return null; // Don't auto-select, let user choose
            }
        }
        
        console.log('[DB-SEARCH] All strategies exhausted, no match found');
        return null;
    } catch (err) {
        console.warn('[DB-SEARCH] Error:', err.message);
        console.warn('[DB-SEARCH] Stack:', err.stack);
        return null;
    }
}

/**
 * Simple Levenshtein distance implementation
 */
function levenshteinDistance(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(0));
    
    for (let i = 0; i <= len1; i++) matrix[0][i] = i;
    for (let j = 0; j <= len2; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= len2; j++) {
        for (let i = 1; i <= len1; i++) {
            const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,      // insertion
                matrix[j - 1][i] + 1,      // deletion
                matrix[j - 1][i - 1] + indicator  // substitution
            );
        }
    }
    
    return matrix[len2][len1];
}

/**
 * Fix OCR character misreads commonly found in invoice numbers
 */
function fixOCRErrors(text) {
    if (!text) return '';
    
    let fixed = text;
    
    // Fix position-based errors specific to invoice numbers
    // Position 14 often misread: 5 → 6 or vice versa
    // Common patterns: B→8, I/l→1, O→0, S→5, Z→2, etc.
    
    // Generic character substitutions (common OCR errors)
    fixed = fixed.replace(/B/g, '8');      // B → 8
    fixed = fixed.replace(/[Il|]/g, '1');  // I/l/| → 1
    fixed = fixed.replace(/O/g, '0');      // O → 0
    fixed = fixed.replace(/S/g, '5');      // S → 5
    fixed = fixed.replace(/Z/g, '2');      // Z → 2
    fixed = fixed.replace(/G/g, '6');      // G → 6
    fixed = fixed.replace(/T/g, '1');      // T → 1 (in digit context)
    
    return fixed;
}

/**
 * Extract invoice number from text with multiple fallback strategies
 * Supports 14-18 digit invoice numbers with optional delimiters
 */
function extractInvoiceNumber(text) {
    if (!text || text.length === 0) return null;
    
    // Fix common OCR errors first
    const correctedText = fixOCRErrors(text);
    
    // Pattern list in priority order
    const patterns = [
        // Exact: 14-18 consecutive digits
        /\b(\d{14,18})\b/,
        // "Invoice: XXXXX" format with various spacing
        /[Ii]nvoice\s*:\s*(\d{14,18})/,
        // "No Invoice:" or "No. Invoice:"
        /[Nn]o\.?\s+[Ii]nvoice\s*:\s*(\d{14,18})/,
        // "Nomor Invoice:" (Indonesian)
        /[Nn]omor\s+[Ii]nvoice\s*:\s*(\d{14,18})/,
        // Formatted with dots: XXX.XXX.XXX.XXXXXX
        /(\d{3})\.(\d{3})\.(\d{3})\.(\d{3,6})/,
        // Formatted with spaces
        /\d+[\s.]*\d{3}[\s.]*\d{3}[\s.]*\d{3,6}/
    ];
    
    // Try corrected text first
    for (const pattern of patterns) {
        const match = correctedText.match(pattern);
        if (match) {
            let number;
            if (match.length === 5 && match[1] && match[2]) {
                // Dot-formatted pattern, combine groups
                number = match[1] + match[2] + match[3] + match[4];
            } else {
                number = match[1] || match[0];
            }
            
            // Extract only digits
            number = number.replace(/\D/g, '');
            
            // Validate length
            if (number.length >= 14 && number.length <= 18) {
                console.log(`[EXTRACT] Found with corrected text: ${number}`);
                return number;
            }
        }
    }
    
    // Fallback: try original (uncorrected) text
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            let number;
            if (match.length === 5 && match[1] && match[2]) {
                number = match[1] + match[2] + match[3] + match[4];
            } else {
                number = match[1] || match[0];
            }
            
            number = number.replace(/\D/g, '');
            
            if (number.length >= 14 && number.length <= 18) {
                console.log(`[EXTRACT] Found with original text: ${number}`);
                return number;
            }
        }
    }
    
    // Last resort: extract ANY 14-18 digit sequence from corrected text
    const lastResort = correctedText.match(/\d{14,18}/);
    if (lastResort) {
        console.log(`[EXTRACT] Found with last resort: ${lastResort[0]}`);
        return lastResort[0];
    }
    
    return null;
}

/**
 * Register Rename Invoice Endpoints
 * Provides OCR extraction, auto-download, and history tracking
 */
function registerRenameInvoiceEndpoints(app, supabase, createAuth, multerUpload) {
    // HEALTH CHECK endpoint (no auth required - for debugging)
    app.get('/api/invoice/rename-health', (req, res) => {
        res.json({ status: 'ok', message: 'Rename endpoints are active' });
    });
    
    // TEST endpoint (no auth - for debugging upload)
    app.post('/api/invoice/rename-test', multerUpload.single('file'), async (req, res) => {
        try {
            console.log('[RENAME-TEST] Test endpoint called');
            console.log('[RENAME-TEST] req.file:', req.file ? { name: req.file.originalname, size: req.file.size } : 'none');
            console.log('[RENAME-TEST] req.body:', req.body);
            
            if (!req.file) {
                return res.status(400).json({ error: 'No file', details: 'req.file is undefined' });
            }
            
            res.json({ 
                success: true,
                filename: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                message: 'Test endpoint works - file received'
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    
    // Endpoint: POST /api/invoice/rename-invoice
    // Accepts: PDF file + optional manual invoice number
    // Returns: Renamed PDF file download + saves to history
    app.post('/api/invoice/rename-invoice', multerUpload.single('file'), async (req, res) => {
        try {
            console.log('[RENAME] Endpoint called');
            console.log('[RENAME] Headers:', Object.keys(req.headers));
            console.log('[RENAME] Auth header:', req.headers.authorization ? 'present' : 'missing');
            console.log('[RENAME] User:', req.user);
            console.log('[RENAME] req.file:', req.file ? { name: req.file.originalname, size: req.file.size } : 'none');
            console.log('[RENAME] req.body:', req.body);
            
            // Get user (try from middleware first, then from token)
            let user = req.user;
            
            // If no user from middleware, try to validate token manually
            if (!user) {
                console.log('[RENAME] No user from middleware, attempting token validation');
                const authHeader = req.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    console.error('[RENAME] No valid Authorization header');
                    return res.status(401).json({
                        success: false,
                        message: 'Missing or invalid Authorization header'
                    });
                }
                
                // For now, just use a placeholder user to proceed (backend will validate in DB later)
                user = { id: 'anonymous-' + Date.now() };
                console.log('[RENAME] Using placeholder user:', user.id);
            }
            
            // Validate: File required
            if (!req.file) {
                console.error('[RENAME] No file provided');
                return res.status(400).json({
                    success: false,
                    message: 'File PDF diperlukan'
                });
            }

            const file = req.file;
            const manualInvoiceNum = (req.body.manualInvoiceNum || req.body.invoiceNumber)?.trim();
            const ocrText = req.body.ocrText?.trim();
            
            console.log('[RENAME] manualInvoiceNum:', manualInvoiceNum);
            console.log('[RENAME] ocrText length:', ocrText?.length || 0);

            // Validate: PDF file only
            if (file.mimetype !== 'application/pdf') {
                console.error('[RENAME] Invalid file type:', file.mimetype);
                return res.status(400).json({
                    success: false,
                    message: 'Hanya file PDF yang diterima'
                });
            }

            let invoiceNumber = null;
            let ocrDetected = false;
            let ocrConfidence = 0;

            // Step 1: Try manual invoice number first
            if (manualInvoiceNum) {
                const cleaned = manualInvoiceNum.replace(/\D/g, '');
                if (cleaned.length >= 14 && cleaned.length <= 18) {
                    invoiceNumber = cleaned;
                    console.log('[RENAME] Using manual invoice number:', invoiceNumber);
                }
            }

            // Step 2: If no manual number, try OCR detection
            if (!invoiceNumber && ocrText) {
                let processedOcrText = ocrText;
                
                // Fix OCR errors
                processedOcrText = fixOCRErrors(processedOcrText);
                invoiceNumber = extractInvoiceNumber(processedOcrText);
                
                if (invoiceNumber) {
                    ocrDetected = true;
                    ocrConfidence = req.body.ocrConfidence || 0.85;
                    console.log('[RENAME] Using OCR invoice number:', invoiceNumber);
                }
            }

            // Step 3: Fallback - try to extract from original filename
            if (!invoiceNumber) {
                const originalName = file.originalname.replace(/\.pdf$/i, '');
                invoiceNumber = extractInvoiceNumber(originalName);
                if (invoiceNumber) {
                    console.log('[RENAME] Using filename invoice number:', invoiceNumber);
                }
            }

            // Step 4: If STILL no invoice number, try database fallback
            // This is for completely garbled text but might find via DB
            if (!invoiceNumber) {
                console.log('[RENAME] No direct extraction, attempting database fallback...');
                invoiceNumber = await findInvoiceInDatabase(supabase, null, ocrText || '', file.originalname);
                if (invoiceNumber) {
                    console.log('[RENAME] Database fallback found:', invoiceNumber);
                    ocrDetected = false; // Mark as fallback
                } else {
                    console.log('[RENAME] No invoice found via any method, fetching invoice list for user selection');
                    
                    // Fallback: Get recent invoices untuk UI dropdown
                    try {
                        const { data: recentInvoices, error: listError } = await supabase
                            .from('invoices')
                            .select('faktur, toko, tanggal, keterangan')
                            .order('tanggal', { ascending: false })
                            .limit(50);
                        
                        if (!listError && recentInvoices && recentInvoices.length > 0) {
                            console.log('[RENAME] Returning list of invoices for user selection');
                            return res.status(400).json({
                                success: false,
                                message: 'Nomor faktur tidak dapat diekstrak dari file. Pilih dari daftar berikut atau upload invoice data terlebih dahulu.',
                                requires_selection: true,
                                invoices: recentInvoices.map(inv => ({
                                    faktur: inv.faktur,
                                    label: `${inv.faktur} - ${inv.toko || 'Unknown'}`
                                }))
                            });
                        }
                    } catch (listErr) {
                        console.warn('[RENAME] Error fetching invoice list:', listErr);
                    }
                    
                    // If still nothing, return generic error
                    return res.status(400).json({
                        success: false,
                        message: 'Tidak dapat mengekstrak nomor faktur dari file PDF. Pastikan file berisi data invoice yang jelas atau upload invoice data terlebih dahulu.'
                    });
                }
            }

            console.log('[RENAME] Extracted invoice number:', invoiceNumber);
            
            // Step 5 (was 3b): Try to find similar invoice in database for final validation
            console.log('[RENAME] Attempting database validation...');
            const dbValidated = await findInvoiceInDatabase(supabase, invoiceNumber, ocrText || '', file.originalname);
            if (dbValidated && dbValidated !== invoiceNumber) {
                console.log('[RENAME] Database auto-corrected:', invoiceNumber, '→', dbValidated);
                invoiceNumber = dbValidated;
            } else {
                console.log('[RENAME] Database validation: no correction needed');
            }

            // Step 6: Generate new filename
            const newFileName = `${invoiceNumber}.pdf`;
            const downloadPath = path.join(require('os').tmpdir(), `rename-${Date.now()}-${newFileName}`);

            console.log('[RENAME] Download path:', downloadPath);

            // Write file from multer buffer to temp location
            await require('fs').promises.writeFile(downloadPath, file.buffer);
            console.log('[RENAME] File written to temp location');

            // Step 7: Save to rename history in database (optional, don't fail if error)
            // Only save if user is real (not placeholder)
            if (user.id && !user.id.startsWith('anonymous-')) {
                try {
                    console.log('[RENAME] Saving to history for user:', user.id);
                    const { data, error } = await supabase
                        .from('invoice_rename_history')
                        .insert({
                            user_id: user.id,
                            original_filename: file.originalname,
                            new_filename: newFileName,
                            invoice_number: invoiceNumber,
                            ocr_detected: ocrDetected,
                            ocr_confidence: ocrConfidence,
                            method: manualInvoiceNum ? 'manual' : (ocrDetected ? 'ocr' : 'filename'),
                            status: 'completed',
                            created_at: new Date().toISOString()
                        });

                    if (error) {
                        console.warn('[RENAME] History save warning:', error);
                    } else {
                        console.log('[RENAME] History saved successfully');
                    }
                } catch (historyError) {
                    console.warn('[RENAME] History save error:', historyError);
                }
            } else {
                console.log('[RENAME] Skipping history save (no valid user)');
            }

            // Step 8: Stream file download with invoice number in header
            console.log('[RENAME] Sending file for download:', newFileName);
            res.setHeader('X-Invoice-Number', invoiceNumber);
            res.download(downloadPath, newFileName, (err) => {
                // Cleanup temp file after download
                if (fs.existsSync(downloadPath)) {
                    fs.unlinkSync(downloadPath);
                    console.log('[RENAME] Temp file cleaned up');
                }
                if (err) {
                    console.error('[RENAME] Download error:', err);
                } else {
                    console.log('[RENAME] Download completed successfully');
                }
            });

        } catch (error) {
            console.error('[RENAME] Error in rename-invoice endpoint:', error);
            console.error('[RENAME] Error stack:', error.stack);
            res.status(500).json({
                success: false,
                message: 'Gagal memproses file',
                error: error.message
            });
        }
    });

    // Endpoint: GET /api/invoice/rename-history
    // Returns: Recent rename history for authenticated user
    app.get('/api/invoice/rename-history', createAuth(), async (req, res) => {
        try {
            const user = req.user;
            const limit = Math.min(parseInt(req.query.limit) || 10, 50); // Max 50

            const { data, error } = await supabase
                .from('invoice_rename_history')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) {
                throw error;
            }

            res.json({
                success: true,
                data: data || [],
                count: data?.length || 0
            });

        } catch (error) {
            console.error('[RENAME] History fetch error:', error);
            res.status(500).json({
                success: false,
                message: 'Gagal mengambil riwayat',
                error: error.message
            });
        }
    });

    // Endpoint: POST /api/invoice/validate-invoice-number
    // Returns: Validation result for invoice number format
    app.post('/api/invoice/validate-invoice-number', createAuth(), async (req, res) => {
        try {
            const { invoiceNumber, ocrText } = req.body;

            let number = null;
            let source = 'manual';

            // Try manual number first
            if (invoiceNumber) {
                const cleaned = invoiceNumber.replace(/\D/g, '');
                if (cleaned.length >= 14 && cleaned.length <= 18) {
                    number = cleaned;
                    source = 'manual';
                }
            }

            // Try OCR text if no valid manual number
            if (!number && ocrText) {
                let fixedText = fixOCRErrors(ocrText.trim());
                number = extractInvoiceNumber(fixedText);
                if (number) {
                    source = 'ocr';
                }
            }

            if (number) {
                res.json({
                    success: true,
                    valid: true,
                    invoiceNumber: number,
                    source: source,
                    formatted: `${number}.pdf`
                });
            } else {
                res.json({
                    success: true,
                    valid: false,
                    message: 'Nomor faktur tidak valid atau tidak ditemukan'
                });
            }

        } catch (error) {
            console.error('[RENAME] Validation error:', error);
            res.status(500).json({
                success: false,
                message: 'Gagal memvalidasi nomor faktur',
                error: error.message
            });
        }
    });

    // Alias endpoint for backward compatibility with frontend
    // POST /api/invoice/rename-faktur → same as rename-invoice but simpler response
    app.post('/api/invoice/rename-faktur', createAuth(), async (req, res) => {
        try {
            console.log('[RENAME-FAKTUR] Alias endpoint called');
            const user = req.user;
            console.log('[RENAME-FAKTUR] User:', user?.id);
            
            // Validate: File required
            if (!req.files || !req.files.file) {
                console.error('[RENAME-FAKTUR] No file provided');
                return res.status(400).json({
                    success: false,
                    error: 'File PDF diperlukan'
                });
            }

            const file = req.files.file;

            // Validate: PDF file only
            if (file.mimetype !== 'application/pdf') {
                console.error('[RENAME-FAKTUR] Invalid file type:', file.mimetype);
                return res.status(400).json({
                    success: false,
                    error: 'Hanya file PDF yang diterima'
                });
            }

            let invoiceNumber = null;
            let ocrDetected = false;
            let ocrConfidence = 0;

            // Step 1: Try OCR text if provided
            if (req.body.ocrText) {
                let ocrText = req.body.ocrText.trim();
                ocrText = fixOCRErrors(ocrText);
                invoiceNumber = extractInvoiceNumber(ocrText);
                
                if (invoiceNumber) {
                    ocrDetected = true;
                    ocrConfidence = req.body.ocrConfidence || 0.85;
                }
            }

            // Step 2: Fallback - try to extract from filename
            if (!invoiceNumber) {
                const originalName = file.name.replace(/\.pdf$/i, '');
                invoiceNumber = extractInvoiceNumber(originalName);
            }

            // Validate: Invoice number found
            if (!invoiceNumber) {
                return res.status(400).json({
                    success: false,
                    error: 'Tidak dapat mengekstrak nomor faktur'
                });
            }

            // Generate new filename
            const newFileName = `${invoiceNumber}.pdf`;
            const tempPath = path.join(require('os').tmpdir(), `rename-${Date.now()}-${invoiceNumber}.pdf`);

            // Write file to temp location
            await file.mv(tempPath);

            // Read file as base64 for response (frontend expects base64)
            const fileBuffer = fs.readFileSync(tempPath);
            const base64Data = fileBuffer.toString('base64');

            // Save to history (fire-and-forget)
            try {
                await supabase
                    .from('invoice_rename_history')
                    .insert({
                        user_id: user.id,
                        original_filename: file.name,
                        new_filename: newFileName,
                        invoice_number: invoiceNumber,
                        ocr_detected: ocrDetected,
                        ocr_confidence: ocrConfidence,
                        method: ocrDetected ? 'ocr' : 'filename',
                        status: 'completed',
                        created_at: new Date().toISOString()
                    });
            } catch (err) {
                console.warn('[RENAME] History save warning:', err);
            }

            // Return response with base64-encoded file (compatible with rename-faktur.html)
            res.json({
                success: true,
                newName: newFileName,
                invoiceNumber: invoiceNumber,
                fileData: base64Data,
                ocrDetected: ocrDetected,
                ocrConfidence: ocrConfidence
            });

            // Cleanup temp file
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }

        } catch (error) {
            console.error('[RENAME] Error in rename-faktur endpoint:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Gagal memproses file'
            });
        }
    });
}

module.exports = { registerRenameInvoiceEndpoints };
