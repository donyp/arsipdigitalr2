// ============================================================
// Invoice Hijau (Green Invoice) Rename Endpoints
// Extract No. Invoice from PDF and rename to invoice number
// ============================================================

const busboy = require('busboy');
const fs = require('fs');
const path = require('path');
const os = require('os');
let pdfParse;
let TesseractModule;
let pdfjs;
let tesseractWorker = null;
let tesseractWorkerInitialized = false;

// Lazy-load dependencies
async function initPdfParse() {
    if (!pdfParse) {
        try {
            pdfParse = require('pdf-parse');
        } catch (err) {
            console.error('[Rename Invoice Hijau] pdf-parse not installed');
        }
    }
    return pdfParse;
}

// Initialize Tesseract worker with proper lang pack handling
async function initTesseractWorker() {
    if (tesseractWorkerInitialized && tesseractWorker) {
        return tesseractWorker;
    }
    
    try {
        if (!TesseractModule) {
            TesseractModule = require('tesseract.js');
            console.log('[Rename Invoice Hijau] ✅ Tesseract.js module loaded');
        }
        
        console.log('[Rename Invoice Hijau] Initializing Tesseract worker...');
        
        // Create worker - Tesseract.js v5 expects: createWorker(langs, oem, options, config)
        // Pass 'ind' directly to createWorker so it loads the language from the start
        tesseractWorker = await TesseractModule.createWorker(
            'ind',  // langs - Indonesian language
            TesseractModule.OEM.LSTM_ONLY,  // oem
            {
                langPath: 'https://tessdata.projectnaptha.com/4.0.0_best/',  // Trailing slash required; will append {lang}.traineddata.gz
                corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@4.5.0/tesseract-core.wasm.js'
            }
        );
        
        console.log('[Rename Invoice Hijau] ✅ Tesseract worker created and initialized with Indonesian');
        
        tesseractWorkerInitialized = true;
        return tesseractWorker;
        
    } catch (err) {
        console.error('[Rename Invoice Hijau] Tesseract worker initialization failed:', err.message);
        console.error('[Rename Invoice Hijau] Stack:', err.stack);
        tesseractWorker = null;
        tesseractWorkerInitialized = false;
        throw err;
    }
}

async function initPdfjs() {
    if (!pdfjs) {
        try {
            pdfjs = require('pdfjs-dist');
            console.log('[Rename Invoice Hijau] ✅ PDF.js loaded');
        } catch (err) {
            console.error('[Rename Invoice Hijau] PDF.js not installed:', err.message);
        }
    }
    return pdfjs;
}

// Extract text via OCR from PDF using pdf2pic + Tesseract
async function extractTextViaOCR(pdfBuffer) {
    const fs = require('fs');
    const path = require('path');
    const tmpDir = require('os').tmpdir();
    
    let tmpPdfFile = null;
    let imagePaths = [];
    let worker = null;
    
    try {
        console.log('[Rename Invoice Hijau] OCR: Starting OCR process with pdf2pic + Tesseract...');
        
        // Step 1: Write PDF to temp file (pdf2pic needs file path, not buffer)
        tmpPdfFile = path.join(tmpDir, `invoice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.pdf`);
        fs.writeFileSync(tmpPdfFile, pdfBuffer);
        console.log(`[Rename Invoice Hijau] OCR: PDF written to ${tmpPdfFile} (${pdfBuffer.length} bytes)`);
        
        // Step 2: Verify PDF file exists before conversion
        if (!fs.existsSync(tmpPdfFile)) {
            console.error('[Rename Invoice Hijau] OCR: Temp PDF file not created');
            return null;
        }
        
        // Step 3: Convert PDF to images using pdf2pic + GraphicsMagick enhancement
        console.log('[Rename Invoice Hijau] OCR: Converting PDF to images (pdf2pic)...');
        const pdf2pic = require('pdf2pic');
        const { exec } = require('child_process');
        const util = require('util');
        const execPromise = util.promisify(exec);
        
        const options = {
            density: 80,            // Lower DPI = faster, still readable for invoice
            saveFilename: 'page',
            savePath: tmpDir,
            format: 'png',
            width: 900,             // Reduced - still sufficient for invoice numbers
            height: 1200,           // Reduced
            preserveAspectRatio: true
        };
        
        let result = null;
        try {
            console.log('[Rename Invoice Hijau] OCR: Creating converter for:', tmpPdfFile);
            
            // pdf2pic v3.2.0 uses fromPath (not fromFilePath)
            const converter = pdf2pic.fromPath(tmpPdfFile, options);
            
            // Convert pages 1-2 only - invoice number usually on page 1-2
            console.log('[Rename Invoice Hijau] OCR: Converting pages 1-2...');
            result = await converter.bulk(-1, { start: 1, end: 2 });
            
            if (!result || result.length === 0) {
                console.warn('[Rename Invoice Hijau] OCR: pdf2pic returned empty result');
                return null;
            }
            
            imagePaths = result.map(r => r.path);
            console.log(`[Rename Invoice Hijau] OCR: ✅ Converted ${imagePaths.length} pages to images`);
            
            // Verify image files exist
            for (let i = 0; i < imagePaths.length; i++) {
                if (!fs.existsSync(imagePaths[i])) {
                    console.warn(`[Rename Invoice Hijau] OCR: Image file ${i + 1} not found: ${imagePaths[i]}`);
                    imagePaths.splice(i, 1);
                    i--;
                } else {
                    const stats = fs.statSync(imagePaths[i]);
                    console.log(`[Rename Invoice Hijau] OCR: Image ${i + 1} exists, size: ${stats.size} bytes`);
                }
            }
            
            if (imagePaths.length === 0) {
                console.error('[Rename Invoice Hijau] OCR: No valid image files created');
                return null;
            }
            
        } catch (convErr) {
            console.error('[Rename Invoice Hijau] OCR: pdf2pic conversion failed:', convErr.message);
            console.error('[Rename Invoice Hijau] OCR: Error stack:', convErr.stack);
            return null;
        }
        
        // Step 4: Initialize Tesseract worker
        console.log('[Rename Invoice Hijau] OCR: Initializing Tesseract worker...');
        try {
            worker = await initTesseractWorker();
            console.log('[Rename Invoice Hijau] OCR: ✅ Tesseract worker ready');
        } catch (initErr) {
            console.error('[Rename Invoice Hijau] OCR: Worker initialization failed:', initErr.message);
            return null;
        }
        
        // Step 5: Run Tesseract OCR on each image - PROCESS PAGES until invoice number found
        console.log('[Rename Invoice Hijau] OCR: Running Tesseract on converted images...');
        let allText = '';
        let pageTexts = [];
        let invoiceNumberFound = false;
        
        for (let i = 0; i < imagePaths.length; i++) {
            const imgPath = imagePaths[i];
            try {
                console.log(`[Rename Invoice Hijau] OCR: Processing image ${i + 1}/${imagePaths.length}: ${imgPath}`);
                
                // Verify file exists before recognition
                if (!fs.existsSync(imgPath)) {
                    console.warn(`[Rename Invoice Hijau] OCR: Image file disappeared: ${imgPath}`);
                    continue;
                }
                
                const startTime = Date.now();
                const result = await worker.recognize(imgPath);
                const elapsedTime = Date.now() - startTime;
                
                const text = result.data.text || '';
                const confidence = result.data.confidence || 0;
                
                console.log(`[Rename Invoice Hijau] OCR: Image ${i + 1} recognized in ${elapsedTime}ms`);
                console.log(`[Rename Invoice Hijau] OCR: Extracted ${text.length} chars, confidence: ${confidence}%`);
                
                pageTexts.push(text);
                allText += '\n' + text;
                
                // Check if invoice number found in this page - if yes, stop processing
                const pageClean = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
                const quickCheck = pageClean.match(/(83510031[01]\d{8,})/);
                if (quickCheck) {
                    console.log(`[Rename Invoice Hijau] OCR: ✅ Invoice number found in page ${i + 1}: ${quickCheck[0]} - stopping further pages`);
                    invoiceNumberFound = true;
                    break; // Stop processing pages
                }
                
            } catch (ocrErr) {
                console.error(`[Rename Invoice Hijau] OCR: Recognition error on image ${i + 1}:`, ocrErr.message);
                console.error('[Rename Invoice Hijau] OCR: Stack:', ocrErr.stack);
                continue;
            }
        }
        
        // Log each page separately for debugging
        console.log(`[Rename Invoice Hijau] OCR: Processing complete - ${pageTexts.length} pages extracted`);
        pageTexts.forEach((text, idx) => {
            console.log(`[Rename Invoice Hijau] OCR: PAGE ${idx + 1} LENGTH: ${text.length} chars`);
        });
        
        if (allText.length > 50) {
            console.log(`[Rename Invoice Hijau] OCR: ✅ Successfully extracted ${allText.length} total characters`);
            return allText;
        } else {
            console.warn('[Rename Invoice Hijau] OCR: Extracted text too short (<50 chars)');
            console.log('[Rename Invoice Hijau] OCR: Text content (first 200 chars):', allText.substring(0, 200));
            return null;
        }
        
    } catch (err) {
        console.error('[Rename Invoice Hijau] OCR extraction error:', err.message);
        console.error('[Rename Invoice Hijau] OCR Stack:', err.stack);
        return null;
    } finally {
        // Cleanup
        try {
            if (tmpPdfFile && fs.existsSync(tmpPdfFile)) {
                fs.unlinkSync(tmpPdfFile);
                console.log('[Rename Invoice Hijau] OCR: Cleaned up temp PDF');
            }
        } catch (e) {}
        
        try {
            for (const imgPath of imagePaths) {
                if (fs.existsSync(imgPath)) {
                    fs.unlinkSync(imgPath);
                }
                // Also cleanup enhanced versions
                const enhancedPath = imgPath.replace('.png', '-enhanced.png');
                if (fs.existsSync(enhancedPath)) {
                    fs.unlinkSync(enhancedPath);
                }
            }
            if (imagePaths.length > 0) {
                console.log('[Rename Invoice Hijau] OCR: Cleaned up temp images');
            }
        } catch (e) {}
    }
}

module.exports = (app, supabase, auditLogger) => {
    const AuditLogger = require('./audit-logger');
    // ============================================
    // GET /api/invoice/rename-invoice-hijau/status
    // Check if PDF processing is ready
    // ============================================
    app.get('/api/invoice/rename-invoice-hijau/status', (req, res) => {
        try {
            require('pdf-parse');
            res.json({ ready: true, message: 'PDF parsing ready' });
        } catch (err) {
            res.json({ ready: false, message: 'PDF parsing not available' });
        }
    });

    // ============================================
    // POST /api/invoice/rename-invoice-hijau
    // Extract No. Invoice from PDF and prepare renamed file
    // ============================================
    app.post('/api/invoice/rename-invoice-hijau', async (req, res) => {
        let responsesSent = false;
        
        const sendResponse = (status, data) => {
            if (!responsesSent) {
                responsesSent = true;
                res.status(status).json(data);
            }
        };

        try {
            console.log('[Rename Invoice Hijau] POST request received');
            console.log('[Rename Invoice Hijau] Content-Type:', req.headers['content-type']);

            // Validate content-type
            if (!req.headers['content-type'] || !req.headers['content-type'].includes('multipart/form-data')) {
                return sendResponse(400, { error: 'Content-Type must be multipart/form-data' });
            }

            // Parse multipart form data
            let bb;
            try {
                bb = busboy({ headers: req.headers });
            } catch (bberr) {
                console.error('[Rename Invoice Hijau] Busboy init error:', bberr.message);
                return sendResponse(400, { error: 'Error initializing form parser: ' + bberr.message });
            }

            let fileData = null;
            let fileName = null;
            let processingStarted = false;

            bb.on('file', (fieldname, file, info) => {
                console.log(`[Rename Invoice Hijau] File field: ${fieldname}, filename: ${info.filename}`);
                fileName = info.filename;

                const chunks = [];
                file.on('data', (data) => {
                    chunks.push(data);
                });

                file.on('end', () => {
                    try {
                        fileData = Buffer.concat(chunks);
                        console.log(`[Rename Invoice Hijau] File received: ${fileName}, size: ${fileData.length} bytes`);
                    } catch (err) {
                        console.error('[Rename Invoice Hijau] Buffer concat error:', err.message);
                    }
                });

                file.on('error', (err) => {
                    console.error('[Rename Invoice Hijau] File stream error:', err.message);
                });
            });

            bb.on('error', (err) => {
                console.error('[Rename Invoice Hijau] Busboy error:', err);
                return sendResponse(400, { error: 'Error parsing form data: ' + err.message });
            });

            bb.on('close', async () => {
                if (processingStarted) return;
                processingStarted = true;

                try {
                    if (!fileData || !fileName) {
                        console.error('[Rename Invoice Hijau] Missing file data');
                        return sendResponse(400, { error: 'File PDF wajib diupload' });
                    }

                    console.log(`[Rename Invoice Hijau] Processing: ${fileName}`);

                    // Initialize pdf-parse
                    const pdf = await initPdfParse();
                    
                    if (!pdf) {
                        console.error('[Rename Invoice Hijau] PDF parser not available');
                        return sendResponse(503, { error: 'PDF parser not available - sistem sedang diinisialisasi' });
                    }

                    // Parse PDF
                    let textContent = '';
                    try {
                        const pdfData = await pdf(fileData);
                        textContent = pdfData.text || '';
                        console.log(`[Rename Invoice Hijau] PDF text extracted, length: ${textContent.length}`);
                    } catch (pdfErr) {
                        console.error('[Rename Invoice Hijau] PDF text extraction failed:', pdfErr.message);
                        textContent = '';
                    }

                    // If PDF text extraction failed or returned minimal text, try OCR
                    if (!textContent || textContent.length < 50) {
                        console.log('[Rename Invoice Hijau] ⚠️  PDF text too short or empty, starting automatic OCR...');
                        
                        try {
                            const ocrText = await extractTextViaOCR(fileData);
                            if (ocrText && ocrText.length > 20) {
                                textContent = ocrText;
                                console.log(`[Rename Invoice Hijau] ✅ OCR extracted ${textContent.length} characters`);
                            } else {
                                console.warn('[Rename Invoice Hijau] OCR returned minimal text or failed');
                            }
                        } catch (ocrErr) {
                            console.error('[Rename Invoice Hijau] OCR processing error:', ocrErr.message);
                            console.error('[Rename Invoice Hijau] Stack:', ocrErr.stack);
                            // Continue anyway - might still have some text from pdf-parse
                        }
                    }

                    // Extract No. Invoice using multiple pattern strategies
                    let noInvoice = null;

                    // Remove common PDF artifacts and normalize spaces
                    const cleanText = textContent.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
                    
                    console.log(`[Rename Invoice Hijau] ===== FULL OCR TEXT =====`);
                    console.log(`[Rename Invoice Hijau] ${cleanText.substring(0, 2000)}`);
                    console.log(`[Rename Invoice Hijau] ===== END FULL TEXT =====`);
                    console.log(`[Rename Invoice Hijau] Total length: ${cleanText.length} chars`);
                    console.log(`[Rename Invoice Hijau] ===== EXTRACTION SUMMARY =====`);

                    // Strategy 1: Strict ANKA pattern with word boundaries
                    // Format: 835100310XXXXXXXX or 835100311XXXXXXXX (at least 18 digits total)
                    let pattern = /\b(83510031[01]\d{8,})\b/g;
                    let matches = cleanText.match(pattern);
                    
                    console.log(`[Rename Invoice Hijau] Strategy 1 - Strict pattern /\\b(83510031[01]\\d{8,})\\b/g`);
                    console.log(`[Rename Invoice Hijau] Matches: ${matches ? matches.join(', ') : 'NONE'}`);

                    if (matches && matches.length > 0) {
                        noInvoice = matches[0];
                        console.log(`[Rename Invoice Hijau] ✅ Found ANKA invoice number (Strategy 1): ${noInvoice}`);
                    } else {
                        // Strategy 2: Looser pattern - no word boundaries (OCR might add spaces/characters)
                        console.log(`[Rename Invoice Hijau] Strategy 1 failed, trying Strategy 2...`);
                        pattern = /(83510031[01]\d{8,})/g;
                        matches = cleanText.match(pattern);
                        console.log(`[Rename Invoice Hijau] Strategy 2 - Loose pattern /(83510031[01]\\d{8,})/g`);
                        console.log(`[Rename Invoice Hijau] Matches: ${matches ? matches.join(', ') : 'NONE'}`);
                        
                        if (matches && matches.length > 0) {
                            // Filter for longest match (most likely correct)
                            noInvoice = matches.reduce((a, b) => a.length >= b.length ? a : b);
                            console.log(`[Rename Invoice Hijau] ✅ Found ANKA invoice number (Strategy 2): ${noInvoice}`);
                        }
                    }

                    // Strategy 3: If still not found, search for any sequence starting with 835100310 or 835100311
                    if (!noInvoice) {
                        console.log(`[Rename Invoice Hijau] Strategy 2 failed, trying Strategy 3 (prefix search)...`);
                        const prefixPattern = /(83510031[01][\d\s]{16,})/g;
                        const prefixMatches = cleanText.match(prefixPattern);
                        console.log(`[Rename Invoice Hijau] Strategy 3 - Prefix search /(83510031[01][\\d\\s]{16,})/g`);
                        console.log(`[Rename Invoice Hijau] Matches: ${prefixMatches ? prefixMatches.join(', ') : 'NONE'}`);
                        
                        if (prefixMatches && prefixMatches.length > 0) {
                            // Clean spaces from the match
                            const cleaned = prefixMatches[0].replace(/\s/g, '');
                            if (cleaned.match(/^83510031[01]\d{8,}$/)) {
                                noInvoice = cleaned;
                                console.log(`[Rename Invoice Hijau] ✅ Found ANKA invoice number (Strategy 3): ${noInvoice}`);
                            }
                        }
                    }

                    // Log ALL numbers found for diagnostic purposes
                    console.log(`[Rename Invoice Hijau] Searching for all numbers in text...`);
                    const allNumbers = cleanText.match(/\d+/g);
                    console.log(`[Rename Invoice Hijau] All numbers found: ${allNumbers ? allNumbers.join(', ') : 'NONE'}`);
                    
                    // Look for sequences that start with 835100310 or 835100311
                    console.log(`[Rename Invoice Hijau] Looking for sequences starting with 835100310 or 835100311...`);
                    const ankaMatches = cleanText.match(/835100310[0-9]*/g);
                    const anka2Matches = cleanText.match(/835100311[0-9]*/g);
                    if (ankaMatches) console.log(`[Rename Invoice Hijau] 835100310* sequences: ${ankaMatches.join(', ')}`);
                    if (anka2Matches) console.log(`[Rename Invoice Hijau] 835100311* sequences: ${anka2Matches.join(', ')}`);

                    // If no invoice found, log and return error
                    if (!noInvoice) {
                        console.error('[Rename Invoice Hijau] Failed to extract invoice number from scanned PDF');
                        return sendResponse(400, {
                            success: false,
                            error: 'Gagal ekstrak nomor invoice dari PDF scan',
                            details: 'OCR tidak dapat membaca teks dari file ini. Kemungkinan kualitas scan terlalu rendah atau nomor invoice tidak terlihat jelas.'
                        });
                    }

                    // Prepare renamed filename
                    const renamedFileName = `${noInvoice}.pdf`;

                    console.log(`[Rename Invoice Hijau] Extracted No. Invoice: ${noInvoice}`);
                    console.log(`[Rename Invoice Hijau] New filename: ${renamedFileName}`);

                    // Log successful rename extraction
                    const { ipAddress } = AuditLogger.extractClientInfo(req);
                    await auditLogger.log({
                        userId: req.user?.userId || null,
                        userEmail: req.user?.email || null,
                        userRole: req.user?.role || null,
                        zonaId: req.user?.zona_id || null,
                        action: 'Extract Invoice Number - Success',
                        resourceType: 'invoice_rename',
                        resourceId: noInvoice,
                        resourceName: renamedFileName,
                        operation: 'UPDATE',
                        details: {
                            originalFileName: fileName,
                            newFileName: renamedFileName,
                            extractedInvoiceNumber: noInvoice,
                            fileSizeBytes: fileData.length
                        },
                        ipAddress: ipAddress,
                        userAgent: req.headers['user-agent'] || 'Unknown',
                        requestPath: '/api/invoice/rename-invoice-hijau',
                        requestMethod: 'POST',
                        statusCode: 200,
                        responseMessage: 'Invoice number extracted successfully',
                        errorMessage: null,
                        isSuspicious: false,
                        severity: 'info'
                    }).catch(() => {});

                    // Return success with extracted data
                    sendResponse(200, {
                        success: true,
                        originalFileName: fileName,
                        newName: renamedFileName,
                        noInvoice: noInvoice,
                        fileData: fileData.toString('base64'), // Send as base64 for download
                        message: 'No. Invoice berhasil diextract'
                    });

                } catch (err) {
                    console.error('[Rename Invoice Hijau] Processing error:', err.message, err.stack);
                    
                    // Log error
                    const { ipAddress } = AuditLogger.extractClientInfo(req);
                    await auditLogger.log({
                        userId: req.user?.userId || null,
                        userEmail: req.user?.email || null,
                        userRole: req.user?.role || null,
                        zonaId: req.user?.zona_id || null,
                        action: 'Extract Invoice Number - Processing Error',
                        resourceType: 'invoice_rename',
                        resourceId: null,
                        resourceName: fileName || 'unknown',
                        operation: 'UPDATE',
                        details: {
                            originalFileName: fileName,
                            fileSizeBytes: fileData?.length || 0
                        },
                        ipAddress: ipAddress,
                        userAgent: req.headers['user-agent'] || 'Unknown',
                        requestPath: '/api/invoice/rename-invoice-hijau',
                        requestMethod: 'POST',
                        statusCode: 500,
                        responseMessage: null,
                        errorMessage: err.message,
                        isSuspicious: false,
                        severity: 'error'
                    }).catch(() => {});
                    
                    return sendResponse(500, { 
                        error: 'Error processing PDF: ' + err.message 
                    });
                }
            });

            // Pipe request to busboy
            req.pipe(bb);

        } catch (error) {
            console.error('[Rename Invoice Hijau] Endpoint error:', error.message, error.stack);
            
            // Log endpoint error
            const { ipAddress } = AuditLogger.extractClientInfo(req);
            await auditLogger.log({
                userId: req.user?.userId || null,
                userEmail: req.user?.email || null,
                userRole: req.user?.role || null,
                zonaId: req.user?.zona_id || null,
                action: 'Extract Invoice Number - Endpoint Error',
                resourceType: 'invoice_rename',
                resourceId: null,
                resourceName: 'unknown',
                operation: 'UPDATE',
                ipAddress: ipAddress,
                userAgent: req.headers['user-agent'] || 'Unknown',
                requestPath: '/api/invoice/rename-invoice-hijau',
                requestMethod: 'POST',
                statusCode: 500,
                responseMessage: null,
                errorMessage: error.message,
                isSuspicious: false,
                severity: 'error'
            }).catch(() => {});
            
            sendResponse(500, { error: 'Server error', details: error.message });
        }
    });

    // ============================================
    // POST /api/invoice/failed-rename
    // Log failed rename attempt (for manual processing later)
    // ============================================
    app.post('/api/invoice/failed-rename', async (req, res) => {
        try {
            const { originalFilename, errorReason, fileSizeBytes, notes } = req.body;
            const userId = req.user?.id || req.user?.userId;
            
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized - no user token' });
            }
            
            if (!originalFilename || !errorReason) {
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: userId,
                    userEmail: req.user?.email || null,
                    userRole: req.user?.role || null,
                    zonaId: req.user?.zona_id || null,
                    action: 'Log Failed Rename - Invalid Parameters',
                    resourceType: 'invoice_rename',
                    resourceId: originalFilename || 'unknown',
                    resourceName: originalFilename || 'unknown',
                    operation: 'CREATE',
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: '/api/invoice/failed-rename',
                    requestMethod: 'POST',
                    statusCode: 400,
                    responseMessage: null,
                    errorMessage: 'Missing required fields',
                    isSuspicious: false,
                    severity: 'warning'
                }).catch(() => {});
                return res.status(400).json({ error: 'Missing required fields' });
            }

            console.log('[Failed Rename] Logging failed attempt:', { originalFilename, errorReason, userId });

            const { data, error } = await supabase
                .from('failed_rename_attempts')
                .insert({
                    original_filename: originalFilename,
                    error_reason: errorReason,
                    file_size_bytes: fileSizeBytes || null,
                    user_id: userId,
                    notes: notes || null
                })
                .select();

            if (error) {
                console.error('[Failed Rename] Database error:', error);
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: userId,
                    userEmail: req.user?.email || null,
                    userRole: req.user?.role || null,
                    zonaId: req.user?.zona_id || null,
                    action: 'Log Failed Rename - Database Error',
                    resourceType: 'invoice_rename',
                    resourceId: originalFilename,
                    resourceName: originalFilename,
                    operation: 'CREATE',
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: '/api/invoice/failed-rename',
                    requestMethod: 'POST',
                    statusCode: 500,
                    responseMessage: null,
                    errorMessage: error.message,
                    isSuspicious: false,
                    severity: 'error'
                }).catch(() => {});
                return res.status(500).json({ error: 'Failed to log attempt: ' + error.message });
            }

            console.log('[Failed Rename] Logged successfully:', data);
            
            // Log successful failed-rename logging (meta logging)
            const { ipAddress } = AuditLogger.extractClientInfo(req);
            await auditLogger.log({
                userId: userId,
                userEmail: req.user?.email || null,
                userRole: req.user?.role || null,
                zonaId: req.user?.zona_id || null,
                action: 'Log Failed Rename Attempt',
                resourceType: 'invoice_rename',
                resourceId: originalFilename,
                resourceName: originalFilename,
                operation: 'CREATE',
                details: {
                    originalFilename: originalFilename,
                    errorReason: errorReason,
                    fileSizeBytes: fileSizeBytes || 0,
                    notes: notes || null
                },
                ipAddress: ipAddress,
                userAgent: req.headers['user-agent'] || 'Unknown',
                requestPath: '/api/invoice/failed-rename',
                requestMethod: 'POST',
                statusCode: 200,
                responseMessage: 'Failed rename attempt logged successfully',
                errorMessage: null,
                isSuspicious: false,
                severity: 'info'
            }).catch(() => {});
            
            res.json({ success: true, data });

        } catch (err) {
            console.error('[Failed Rename] Error:', err.message);
            const { ipAddress } = AuditLogger.extractClientInfo(req);
            await auditLogger.log({
                userId: req.user?.userId || null,
                userEmail: req.user?.email || null,
                userRole: req.user?.role || null,
                zonaId: req.user?.zona_id || null,
                action: 'Log Failed Rename - Server Error',
                resourceType: 'invoice_rename',
                resourceId: req.body?.originalFilename || 'unknown',
                resourceName: req.body?.originalFilename || 'unknown',
                operation: 'CREATE',
                ipAddress: ipAddress,
                userAgent: req.headers['user-agent'] || 'Unknown',
                requestPath: '/api/invoice/failed-rename',
                requestMethod: 'POST',
                statusCode: 500,
                responseMessage: null,
                errorMessage: err.message,
                isSuspicious: false,
                severity: 'error'
            }).catch(() => {});
            res.status(500).json({ error: err.message });
        }
    });

    // ============================================
    // GET /api/invoice/failed-rename
    // Get all failed rename attempts for current user
    // ============================================
    app.get('/api/invoice/failed-rename', async (req, res) => {
        try {
            // Extract user dari Authorization header
            const authHeader = req.headers['authorization'];
            console.log('[Failed Rename] Auth header:', authHeader ? 'present' : 'missing');
            
            const token = authHeader && authHeader.split(' ')[1];
            
            if (!token) {
                console.warn('[Failed Rename] No token provided');
                return res.status(401).json({ error: 'Unauthorized - missing token' });
            }
            
            console.log('[Failed Rename] Token received, verifying...');
            
            // Decode token untuk dapatkan user info
            let userIdFromToken = null;
            try {
                const jwt = require('jsonwebtoken');
                const secret = process.env.JWT_SECRET || 'change-this-to-a-very-long-random-string';
                console.log('[Failed Rename] Using JWT secret:', secret.substring(0, 10) + '...');
                
                const decoded = jwt.verify(token, secret);
                console.log('[Failed Rename] Token decoded successfully:', JSON.stringify(decoded));
                userIdFromToken = decoded.userId || decoded.id;
            } catch (err) {
                console.error('[Failed Rename] Token decode error:', err.message);
                console.error('[Failed Rename] Token:', token.substring(0, 50) + '...');
                return res.status(401).json({ error: 'Invalid token: ' + err.message });
            }
            
            if (!userIdFromToken) {
                console.warn('[Failed Rename] No user ID in token');
                return res.status(401).json({ error: 'Invalid token - no user ID' });
            }

            const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
            
            console.log('[Failed Rename] Fetching failed attempts for user:', userIdFromToken);

            const { data, error } = await supabase
                .from('failed_rename_attempts')
                .select('*')
                .eq('user_id', userIdFromToken)
                .order('attempted_at', { ascending: false })
                .limit(limit);

            if (error) {
                console.error('[Failed Rename] Database error:', error);
                return res.status(500).json({ error: 'Failed to fetch: ' + error.message });
            }

            console.log('[Failed Rename] Fetched', data?.length || 0, 'records');
            res.json({ success: true, attempts: data || [], total: data?.length || 0 });

        } catch (err) {
            console.error('[Failed Rename] Error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ============================================
    // GET /api/invoice/rename-history
    // Get all successful rename history for current user
    // ============================================
    app.get('/api/invoice/rename-history', async (req, res) => {
        try {
            // Extract user dari Authorization header
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];
            
            if (!token) {
                console.warn('[Rename History] No token provided');
                return res.status(401).json({ error: 'Unauthorized - missing token' });
            }
            
            // Decode token untuk dapatkan user info
            let userIdFromToken = null;
            try {
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'change-this-to-a-very-long-random-string');
                userIdFromToken = decoded.userId || decoded.id;
            } catch (err) {
                console.error('[Rename History] Token decode error:', err.message);
                return res.status(401).json({ error: 'Invalid token' });
            }
            
            if (!userIdFromToken) {
                return res.status(401).json({ error: 'Invalid token - no user ID' });
            }

            const limit = parseInt(req.query.limit) || 100;
            
            console.log('[Rename History] Fetching rename history for user:', userIdFromToken);

            const { data, error } = await supabase
                .from('rename_history')
                .select('*')
                .eq('renamed_by', userIdFromToken)
                .order('renamed_at', { ascending: false })
                .limit(limit);

            if (error) {
                console.error('[Rename History] Database error:', error);
                return res.status(500).json({ error: 'Failed to fetch: ' + error.message });
            }

            console.log('[Rename History] Fetched', data?.length || 0, 'records');
            res.json({ success: true, history: data || [], total: data?.length || 0 });

        } catch (err) {
            console.error('[Rename History] Error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ============================================
    // DELETE /api/invoice/failed-rename/:id
    // Delete a failed rename attempt record
    // ============================================
    app.delete('/api/invoice/failed-rename/:id', async (req, res) => {
        try {
            // Extract user dari Authorization header
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];
            
            if (!token) {
                console.warn('[Failed Rename] No token provided');
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: null,
                    userEmail: null,
                    userRole: null,
                    zonaId: null,
                    action: 'Delete Failed Rename - No Token',
                    resourceType: 'invoice_rename',
                    resourceId: req.params.id,
                    resourceName: req.params.id,
                    operation: 'DELETE',
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: `/api/invoice/failed-rename/${req.params.id}`,
                    requestMethod: 'DELETE',
                    statusCode: 401,
                    responseMessage: null,
                    errorMessage: 'Unauthorized - missing token',
                    isSuspicious: true,
                    severity: 'warning'
                }).catch(() => {});
                return res.status(401).json({ error: 'Unauthorized - missing token' });
            }
            
            // Decode token untuk dapatkan user info
            let userIdFromToken = null;
            let userEmail = null;
            try {
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'change-this-to-a-very-long-random-string');
                userIdFromToken = decoded.userId || decoded.id;
                userEmail = decoded.email || null;
            } catch (err) {
                console.error('[Failed Rename] Token decode error:', err.message);
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: null,
                    userEmail: null,
                    userRole: null,
                    zonaId: null,
                    action: 'Delete Failed Rename - Invalid Token',
                    resourceType: 'invoice_rename',
                    resourceId: req.params.id,
                    resourceName: req.params.id,
                    operation: 'DELETE',
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: `/api/invoice/failed-rename/${req.params.id}`,
                    requestMethod: 'DELETE',
                    statusCode: 401,
                    responseMessage: null,
                    errorMessage: 'Invalid token',
                    isSuspicious: true,
                    severity: 'warning'
                }).catch(() => {});
                return res.status(401).json({ error: 'Invalid token' });
            }
            
            if (!userIdFromToken) {
                console.warn('[Failed Rename] No user ID in token');
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: null,
                    userEmail: userEmail,
                    userRole: null,
                    zonaId: null,
                    action: 'Delete Failed Rename - No User ID',
                    resourceType: 'invoice_rename',
                    resourceId: req.params.id,
                    resourceName: req.params.id,
                    operation: 'DELETE',
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: `/api/invoice/failed-rename/${req.params.id}`,
                    requestMethod: 'DELETE',
                    statusCode: 401,
                    responseMessage: null,
                    errorMessage: 'Invalid token - no user ID',
                    isSuspicious: true,
                    severity: 'warning'
                }).catch(() => {});
                return res.status(401).json({ error: 'Invalid token - no user ID' });
            }

            const { id } = req.params;

            console.log('[Failed Rename] Deleting attempt:', id);

            const { error } = await supabase
                .from('failed_rename_attempts')
                .delete()
                .eq('id', id)
                .eq('user_id', userIdFromToken);

            if (error) {
                console.error('[Failed Rename] Database error:', error);
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: userIdFromToken,
                    userEmail: userEmail,
                    userRole: null,
                    zonaId: null,
                    action: 'Delete Failed Rename - Database Error',
                    resourceType: 'invoice_rename',
                    resourceId: id,
                    resourceName: id,
                    operation: 'DELETE',
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: `/api/invoice/failed-rename/${id}`,
                    requestMethod: 'DELETE',
                    statusCode: 500,
                    responseMessage: null,
                    errorMessage: error.message,
                    isSuspicious: false,
                    severity: 'error'
                }).catch(() => {});
                return res.status(500).json({ error: 'Failed to delete: ' + error.message });
            }

            console.log('[Failed Rename] Deleted successfully');
            
            // Log successful deletion
            const { ipAddress } = AuditLogger.extractClientInfo(req);
            await auditLogger.log({
                userId: userIdFromToken,
                userEmail: userEmail,
                userRole: null,
                zonaId: null,
                action: 'Delete Failed Rename Attempt',
                resourceType: 'invoice_rename',
                resourceId: id,
                resourceName: id,
                operation: 'DELETE',
                ipAddress: ipAddress,
                userAgent: req.headers['user-agent'] || 'Unknown',
                requestPath: `/api/invoice/failed-rename/${id}`,
                requestMethod: 'DELETE',
                statusCode: 200,
                responseMessage: 'Failed rename attempt deleted successfully',
                errorMessage: null,
                isSuspicious: false,
                severity: 'info'
            }).catch(() => {});
            
            res.json({ success: true });

        } catch (err) {
            console.error('[Failed Rename] Error:', err.message);
            const { ipAddress } = AuditLogger.extractClientInfo(req);
            await auditLogger.log({
                userId: null,
                userEmail: null,
                userRole: null,
                zonaId: null,
                action: 'Delete Failed Rename - Server Error',
                resourceType: 'invoice_rename',
                resourceId: req.params.id,
                resourceName: req.params.id,
                operation: 'DELETE',
                ipAddress: ipAddress,
                userAgent: req.headers['user-agent'] || 'Unknown',
                requestPath: `/api/invoice/failed-rename/${req.params.id}`,
                requestMethod: 'DELETE',
                statusCode: 500,
                responseMessage: null,
                errorMessage: err.message,
                isSuspicious: false,
                severity: 'error'
            }).catch(() => {});
            res.status(500).json({ error: err.message });
        }
    });
};
