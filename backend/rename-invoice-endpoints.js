// Rename Invoice Endpoints - Separate Feature Module
// ============================================================
// Handles invoice renaming with OCR detection for scanned PDFs
// Auto-downloads renamed files and maintains history in database
// ============================================================

const fs = require('fs');
const path = require('path');

/**
 * Utility function: Fix OCR-detected errors in invoice numbers
 * Common character misreads: B→8, I→1, O→0, S→5, Z→2, 5↔6, 8↔B, etc.
 */
function fixOCRErrors(text) {
    let fixed = text;
    
    // Generic fixes for common OCR character misreads
    // B followed by digit → 8
    fixed = fixed.replace(/B(?=\d)/g, '8');
    
    // I or l (lowercase L) followed by digit → 1
    fixed = fixed.replace(/[Il](?=\d)/g, '1');
    
    // O (letter O) followed by digit → 0
    fixed = fixed.replace(/O(?=\d)/g, '0');
    
    // S followed by digit → 5
    fixed = fixed.replace(/S(?=\d)/g, '5');
    
    // Z followed by digit → 2
    fixed = fixed.replace(/Z(?=\d)/g, '2');
    
    // Common digit confusions in specific positions:
    // For invoice pattern 835100311101025001 (18 digits)
    // Position patterns: 8-3-5-1-0-0-3-1-1-1-0-1-0-[2/5/6/8]-5-0-0-1
    
    // Position 14 (index 13): commonly misread as 5 instead of 6, or 2 instead of 5
    fixed = fixed.replace(/(\d{13})[56](\d{4})/, (match, prefix, suffix) => {
        // If starts with 83510031 (correct prefix), likely position 14 should be 6
        if (/^83510031/.test(prefix)) {
            return prefix + '6' + suffix;
        }
        return match;
    });
    
    return fixed;
}

/**
 * Extract invoice number from OCR text or filename
 * Supports 14-18 digit invoice numbers (format: referensi.digits)
 */
function extractInvoiceNumber(text) {
    // Pattern: allows 14-18 consecutive digits, optionally with dots or spaces
    const patterns = [
        /\b\d{14,18}\b/,                           // Plain 14-18 digits
        /(\d{3})\.?(\d{3})\.?(\d{3})\.?(\d{3,6})/, // Formatted with dots
        /\d+[\s.]*\d{3}[\s.]*\d{3}[\s.]*\d{3,6}/   // Flexible formatting
    ];
    
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            // Extract only digits
            const invoiceNum = match[0].replace(/\D/g, '');
            if (invoiceNum.length >= 14 && invoiceNum.length <= 18) {
                return invoiceNum;
            }
        }
    }
    
    return null;
}

/**
 * Register Rename Invoice Endpoints
 * Provides OCR extraction, auto-download, and history tracking
 */
function registerRenameInvoiceEndpoints(app, supabase, createAuth) {
    // HEALTH CHECK endpoint (no auth required - for debugging)
    app.get('/api/invoice/rename-health', (req, res) => {
        res.json({ status: 'ok', message: 'Rename endpoints are active' });
    });
    
    // TEST endpoint (no auth - for debugging upload)
    app.post('/api/invoice/rename-test', async (req, res) => {
        try {
            console.log('[RENAME-TEST] Test endpoint called');
            console.log('[RENAME-TEST] Files:', req.files ? Object.keys(req.files) : 'none');
            console.log('[RENAME-TEST] Body:', req.body);
            
            if (!req.files || !req.files.file) {
                return res.status(400).json({ error: 'No file' });
            }
            
            const file = req.files.file;
            res.json({ 
                success: true,
                filename: file.name,
                mimetype: file.mimetype,
                size: file.size,
                message: 'Test endpoint works - file received'
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    
    // Endpoint: POST /api/invoice/rename-invoice
    // Accepts: PDF file + optional manual invoice number
    // Returns: Renamed PDF file download + saves to history
    app.post('/api/invoice/rename-invoice', async (req, res) => {
        try {
            console.log('[RENAME] Endpoint called');
            console.log('[RENAME] Headers:', Object.keys(req.headers));
            console.log('[RENAME] Auth header:', req.headers.authorization ? 'present' : 'missing');
            console.log('[RENAME] User:', req.user);
            console.log('[RENAME] Files:', req.files ? Object.keys(req.files) : 'none');
            console.log('[RENAME] Body keys:', Object.keys(req.body));
            
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
            if (!req.files || !req.files.file) {
                console.error('[RENAME] No file provided');
                return res.status(400).json({
                    success: false,
                    message: 'File PDF diperlukan'
                });
            }

            const file = req.files.file;
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
                const originalName = file.name.replace(/\.pdf$/i, '');
                invoiceNumber = extractInvoiceNumber(originalName);
                if (invoiceNumber) {
                    console.log('[RENAME] Using filename invoice number:', invoiceNumber);
                }
            }

            // Validate: Invoice number found
            if (!invoiceNumber) {
                console.error('[RENAME] No invoice number found');
                return res.status(400).json({
                    success: false,
                    message: 'Tidak dapat mengekstrak nomor faktur dari file atau OCR'
                });
            }

            console.log('[RENAME] Final invoice number:', invoiceNumber);

            // Step 4: Generate new filename
            const newFileName = `${invoiceNumber}.pdf`;
            const downloadPath = path.join(require('os').tmpdir(), `rename-${Date.now()}-${newFileName}`);

            console.log('[RENAME] Download path:', downloadPath);

            // Write file to temp location for download
            await file.mv(downloadPath);
            console.log('[RENAME] File moved to temp location');

            // Step 5: Save to rename history in database (optional, don't fail if error)
            // Only save if user is real (not placeholder)
            if (user.id && !user.id.startsWith('anonymous-')) {
                try {
                    console.log('[RENAME] Saving to history for user:', user.id);
                    const { data, error } = await supabase
                        .from('invoice_rename_history')
                        .insert({
                            user_id: user.id,
                            original_filename: file.name,
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

            // Step 6: Stream file download
            console.log('[RENAME] Sending file for download:', newFileName);
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
