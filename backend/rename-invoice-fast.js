// ============================================================
// Fast Invoice Rename - Filename-First + Aggressive DB Fuzzy Match
// No slow OCR - uses filename parsing + database fallback
// Designed for batch processing 25+ files quickly
// ============================================================

const fs = require('fs');
const path = require('path');

/**
 * Smart filename parsing - extract invoice number dari berbagai format
 * FAST - no external ML/OCR required
 */
function extractNumberFromFilename(filename) {
    const cleanName = filename.replace(/\.pdf$/i, '').trim();
    
    // Pattern 1: Pure numbers (835100311128026001.pdf)
    const pureNumbers = cleanName.match(/\b(\d{14,18})\b/);
    if (pureNumbers) return pureNumbers[1];
    
    // Pattern 2: With separators (835-100-311-128-026001 atau 835 100 311 128 026001)
    const withSeparators = cleanName.match(/(\d{3})[.\s-](\d{3})[.\s-](\d{3})[.\s-](\d{3,6})/);
    if (withSeparators) return withSeparators[1] + withSeparators[2] + withSeparators[3] + withSeparators[4];
    
    // Pattern 3: With prefix (INV-, NO-, FAKTUR-, etc)
    const prefixed = cleanName.match(/(?:INV|NO|FAKTUR|INVOICE)[.\s-]*(\d{14,18})/i);
    if (prefixed) return prefixed[1];
    
    // Pattern 4: Any 14-18 digit
    const anySeq = cleanName.match(/\b\d{14,18}\b/);
    if (anySeq) return anySeq[0];
    
    // Pattern 5: 8+ digits (will fuzzy match)
    const partial = cleanName.match(/\b(\d{8,13})\b/);
    if (partial) return partial[1];
    
    return null;
}

/**
 * Aggressive fuzzy matching - find invoice in DB dengan relaxed criteria
 * FAST - 3 strategies, each query returns quickly
 */
async function findInvoiceAggressive(supabase, partialNumber) {
    if (!partialNumber) return null;
    
    try {
        // Strategy A: Exact
        const { data: exact } = await supabase
            .from('invoice_file_list')
            .select('faktur')
            .eq('faktur', partialNumber)
            .limit(1);
        if (exact?.length > 0) return exact[0].faktur;
        
        // Strategy B: Contains
        if (partialNumber.length >= 8) {
            const { data: contains } = await supabase
                .from('invoice_file_list')
                .select('faktur')
                .ilike('faktur', `%${partialNumber}%`)
                .limit(1);
            if (contains?.length > 0) return contains[0].faktur;
        }
        
        // Strategy C: Prefix (first 8 digits)
        if (partialNumber.length >= 8) {
            const prefix = partialNumber.substring(0, 8);
            const { data: prefixMatch } = await supabase
                .from('invoice_file_list')
                .select('faktur')
                .ilike('faktur', `${prefix}%`)
                .limit(1);
            if (prefixMatch?.length > 0) return prefixMatch[0].faktur;
        }
        
        return null;
    } catch (err) {
        console.warn('[FUZZY] Error:', err.message);
        return null;
    }
}

/**
 * Register Fast Rename Endpoints
 */
function registerFastRenameEndpoints(app, supabase, createAuth, multerUpload) {
    
    // POST /api/invoice/rename-invoice
    app.post('/api/invoice/rename-invoice', multerUpload.single('file'), async (req, res) => {
        try {
            const file = req.file;
            if (!file || file.mimetype !== 'application/pdf') {
                return res.status(400).json({
                    success: false,
                    message: 'Hanya file PDF yang diterima'
                });
            }

            // Get user (or placeholder)
            let user = req.user;
            if (!user) {
                const authHeader = req.headers.authorization;
                if (!authHeader?.startsWith('Bearer ')) {
                    return res.status(401).json({ success: false, message: 'Unauthorized' });
                }
                user = { id: 'anon-' + Date.now() };
            }

            const manualNum = (req.body.manualInvoiceNum || req.body.invoiceNumber)?.trim();
            let invoiceNumber = null;

            console.log('[RENAME] Processing:', file.originalname);

            // Step 1: Manual number (if provided)
            if (manualNum) {
                const cleaned = manualNum.replace(/\D/g, '');
                if (cleaned.length >= 14 && cleaned.length <= 18) {
                    invoiceNumber = cleaned;
                    console.log('[RENAME] Manual:', invoiceNumber);
                }
            }

            // Step 2: Filename parsing (FAST - no OCR)
            if (!invoiceNumber) {
                invoiceNumber = extractNumberFromFilename(file.originalname);
                if (invoiceNumber) {
                    console.log('[RENAME] Filename extract:', invoiceNumber);
                    // Try fuzzy match against DB
                    const matched = await findInvoiceAggressive(supabase, invoiceNumber);
                    if (matched) {
                        console.log('[RENAME] DB fuzzy matched:', invoiceNumber, '→', matched);
                        invoiceNumber = matched;
                    }
                }
            }

            // Step 3: Latest invoice fallback
            if (!invoiceNumber) {
                console.log('[RENAME] Using latest invoice from DB');
                const { data: latest } = await supabase
                    .from('invoice_file_list')
                    .select('faktur')
                    .order('tanggal', { ascending: false })
                    .limit(1);
                
                if (latest?.length > 0) {
                    invoiceNumber = latest[0].faktur;
                } else {
                    return res.status(400).json({
                        success: false,
                        message: 'No invoices in database'
                    });
                }
            }

            console.log('[RENAME] Final invoice:', invoiceNumber);
            const newFileName = `${invoiceNumber}.pdf`;
            const downloadPath = path.join(require('os').tmpdir(), `rename-${Date.now()}-${newFileName}`);

            // Write & download
            await require('fs').promises.writeFile(downloadPath, file.buffer);
            res.setHeader('X-Invoice-Number', invoiceNumber);
            res.download(downloadPath, newFileName, (err) => {
                if (fs.existsSync(downloadPath)) fs.unlinkSync(downloadPath);
                if (err) console.error('[RENAME] Download error:', err);
                else console.log('[RENAME] Success');
            });

            // Save history (async, don't block)
            if (!user.id.startsWith('anon-')) {
                supabase.from('invoice_rename_history').insert({
                    user_id: user.id,
                    original_filename: file.originalname,
                    new_filename: newFileName,
                    invoice_number: invoiceNumber,
                    method: manualNum ? 'manual' : 'filename',
                    status: 'completed',
                    created_at: new Date().toISOString()
                }).catch(err => console.warn('[RENAME] History error:', err));
            }

        } catch (error) {
            console.error('[RENAME] Error:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    });

    // GET /api/invoice/rename-health
    app.get('/api/invoice/rename-health', (req, res) => {
        res.json({ status: 'ok', method: 'filename-first' });
    });

    // GET /api/invoice/rename-history
    app.get('/api/invoice/rename-history', createAuth(), async (req, res) => {
        try {
            const { data } = await supabase
                .from('invoice_rename_history')
                .select('*')
                .eq('user_id', req.user.id)
                .order('created_at', { ascending: false })
                .limit(Math.min(parseInt(req.query.limit) || 10, 50));
            
            res.json({ success: true, data: data || [], count: data?.length || 0 });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });
}

module.exports = { registerFastRenameEndpoints };
