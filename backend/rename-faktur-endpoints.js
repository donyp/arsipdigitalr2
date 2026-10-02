// Rename Faktur Pajak Endpoints
// Extracts data from PDF and renames as: tax-NAMA_TOKO NOMINAL

let pdfParse = null;
const busboy = require('busboy');

// Lazy-load pdf-parse with better error handling
async function initPdfParse() {
    if (!pdfParse) {
        try {
            pdfParse = require('pdf-parse');
            console.log('[Rename Faktur] pdf-parse loaded successfully');
        } catch (err) {
            console.error('[Rename Faktur] pdf-parse not installed:', err.message);
            throw new Error(`PDF parsing library not ready. Please wait while npm installs dependencies. Error: ${err.message}`);
        }
    }
    return pdfParse;
}

module.exports = (app, supabase) => {
    // ============================================
    // GET /api/invoice/rename-faktur/status
    // Check if PDF processing is ready
    // ============================================
    app.get('/api/invoice/rename-faktur/status', (req, res) => {
        try {
            require('pdf-parse');
            res.json({ ready: true, message: 'PDF processing ready' });
        } catch (err) {
            res.json({ 
                ready: false, 
                message: 'PDF processing not ready - npm install in progress',
                error: err.message 
            });
        }
    });

    // ============================================
    // POST /api/invoice/rename-faktur
    // Extract data from PDF and prepare renamed file
    // ============================================
    app.post('/api/invoice/rename-faktur', async (req, res) => {
        try {
            console.log('[Rename Faktur] POST request received');
            console.log('[Rename Faktur] Content-Type:', req.headers['content-type']);

            // Validate content-type
            if (!req.headers['content-type'] || !req.headers['content-type'].includes('multipart/form-data')) {
                return res.status(400).json({ error: 'Content-Type must be multipart/form-data' });
            }

            // Parse multipart form data
            let bb;
            try {
                bb = busboy({ headers: req.headers });
            } catch (bberr) {
                console.error('[Rename Faktur] Busboy init error:', bberr.message);
                return res.status(400).json({ error: 'Error initializing form parser: ' + bberr.message });
            }
            
            let fileData = null;
            let fileName = null;

            bb.on('file', (fieldname, file, info) => {
                console.log(`[Rename Faktur] File field: ${fieldname}, filename: ${info.filename}`);
                fileName = info.filename;
                
                const chunks = [];
                file.on('data', (data) => {
                    chunks.push(data);
                });
                
                file.on('end', () => {
                    fileData = Buffer.concat(chunks);
                    console.log(`[Rename Faktur] File received: ${fileName}, size: ${fileData.length} bytes`);
                });
            });

            bb.on('error', (err) => {
                console.error('[Rename Faktur] Busboy error:', err);
                res.status(400).json({ error: 'Error parsing form data: ' + err.message });
            });

            bb.on('close', async () => {
                try {
                    if (!fileData || !fileName) {
                        console.error('[Rename Faktur] Missing file data');
                        return res.status(400).json({ error: 'File PDF wajib diupload' });
                    }

                    console.log(`[Rename Faktur] Processing: ${fileName}`);

                    // Initialize pdf-parse
                    const pdf = await initPdfParse();

                    // Parse PDF
                    const pdfData = await pdf(fileData);
                    const textContent = pdfData.text;

                    console.log(`[Rename Faktur] PDF text extracted, length: ${textContent.length}`);
                    console.log(`[Rename Faktur] First 500 chars: ${textContent.substring(0, 500)}`);
                    console.log(`[Rename Faktur] Last 500 chars (for referensi scanning): ${textContent.substring(Math.max(0, textContent.length - 500))}`);
                    console.log(`[Rename Faktur] ========== BEGIN REFERENSI SCANNING ==========`);

                    // Extract nama toko (Pembeli Barang Kena Pajak) - strict pattern
                    let namaToko = null;
                    
                    // Find "Pembeli Barang Kena Pajak/Penerima Jasa Kena Pajak" section first
                    const pembeligPattern = /Pembeli\s+Barang\s+Kena\s+Pajak\s*\/\s*Penerima\s+Jasa\s+Kena\s+Pajak\s*:\s*(.+?)(?=Pembeli|Pengguna|$)/is;
                    const pemberliMatch = textContent.match(pembeligPattern);
                    
                    if (pemberliMatch) {
                        // Look for "Nama :" within this section only
                        const pemberliSection = pemberliMatch[1];
                        const namaMatch = pemberliSection.match(/Nama\s*:\s*([^\n]+)/i);
                        if (namaMatch) {
                            namaToko = namaMatch[1].trim();
                            console.log(`[Rename Faktur] Extracted from Pembeli section: ${namaToko}`);
                        }
                    }
                    
                    // Fallback patterns if not found
                    if (!namaToko) {
                        const fallbackPatterns = [
                            /Penerima\s+Jasa\s+Kena\s+Pajak[:\s]*Nama\s*:\s*([^\n]+)/i,
                            /Pembeli\s+Barang[^:]*Nama\s*:\s*([^\n]+)/i,
                            /Nama\s*:\s*([A-Z][^\n]*(?:PT|CV|UD|TOKO|KOPERASI|FIRMA)[^\n]*)/i,
                        ];
                        
                        for (const pattern of fallbackPatterns) {
                            const match = textContent.match(pattern);
                            if (match) {
                                namaToko = match[1].trim();
                                console.log(`[Rename Faktur] Fallback pattern matched: ${pattern}`);
                                break;
                            }
                        }
                    }

                    // Skip if nama tidak ditemukan
                    if (!namaToko) {
                        return res.json({
                            success: false,
                            error: 'Nama toko tidak ditemukan di PDF'
                        });
                    }

                    // Skip if nama adalah Garuda Gemilang Indonesia (pengguna pajak, bukan pembeli)
                    if (namaToko.toUpperCase().includes('GARUDA GEMILANG')) {
                        return res.json({
                            success: false,
                            error: 'File adalah dari Garuda Gemilang Indonesia (pengguna pajak, bukan pembeli)'
                        });
                    }

                    console.log(`[Rename Faktur] Nama Toko: ${namaToko}`);

                    // Extract Harga Jual/Penggantian/Uang Muka/Termin - more flexible
                    let hargaMatch = textContent.match(/Harga\s+Jual\s*\/\s*Penggantian\s*\/\s*Uang\s+Muka\s*\/\s*Termin[:\s]*([0-9.,]+)/i);
                    if (!hargaMatch) {
                        hargaMatch = textContent.match(/Harga\s+Jual[:\s]*([0-9.,]+)/i);
                    }
                    if (!hargaMatch) {
                        hargaMatch = textContent.match(/(?:Harga|Nilai)[^:]*:[^0-9]*([0-9.,]+)/);
                    }
                    const hargaStr = hargaMatch ? hargaMatch[1].trim() : '0';
                    const harga = cleanNumber(hargaStr);
                    
                    console.log(`[Rename Faktur] Harga raw: "${hargaStr}" → parsed: ${harga}`);

                    // Extract Jumlah PPN - more flexible
                    let ppnMatch = textContent.match(/Jumlah\s+PPN\s*\([^)]*\)[:\s]*([0-9.,]+)/i);
                    if (!ppnMatch) {
                        ppnMatch = textContent.match(/Jumlah\s+PPN[^:]*(?:Pajak\s+Pertambahan\s+Nilai)?[:\s]*([0-9.,]+)/i);
                    }
                    if (!ppnMatch) {
                        ppnMatch = textContent.match(/PPN[:\s]*([0-9.,]+)/i);
                    }
                    const ppnStr = ppnMatch ? ppnMatch[1].trim() : '0';
                    const ppn = cleanNumber(ppnStr);
                    
                    console.log(`[Rename Faktur] PPN raw: "${ppnStr}" → parsed: ${ppn}`);

                    // Calculate total nominal
                    const totalNominal = harga + ppn;

                    if (totalNominal === 0) {
                        return res.json({
                            success: false,
                            error: 'Nominal tidak dapat diekstrak dari PDF'
                        });
                    }

                    // Extract Referensi number from bottom of PDF - for tax reference tracking
                    // Scanning logic: mencari "Referensi:" diikuti dengan 15-20 digit number
                    let referensi = null;
                    
                    // Pattern 1: Standard "Referensi : XXXXX" format
                    let referensiMatch = textContent.match(/Referensi\s*:\s*(\d{15,20})/i);
                    if (referensiMatch) {
                        referensi = referensiMatch[1].trim();
                        console.log(`[Rename Faktur] Referensi detected (Pattern 1): ${referensi}`);
                    }
                    
                    // Pattern 2: If not found, try with more flexible spacing/line breaks
                    if (!referensi) {
                        referensiMatch = textContent.match(/Referensi\s+:\s*\n?\s*(\d{15,20})/i);
                        if (referensiMatch) {
                            referensi = referensiMatch[1].trim();
                            console.log(`[Rename Faktur] Referensi detected (Pattern 2): ${referensi}`);
                        }
                    }
                    
                    // Pattern 3: Try without colon
                    if (!referensi) {
                        referensiMatch = textContent.match(/Referensi\s+(\d{15,20})/i);
                        if (referensiMatch) {
                            referensi = referensiMatch[1].trim();
                            console.log(`[Rename Faktur] Referensi detected (Pattern 3): ${referensi}`);
                        }
                    }
                    
                    // Pattern 4: Extract last 15-20 digits from "Referensi" section (fallback for OCR variations)
                    if (!referensi) {
                        const referensiSectionMatch = textContent.match(/Referensi\s*[:\s]*([A-Za-z0-9\s.-]*\d[A-Za-z0-9\s.-]*)/i);
                        if (referensiSectionMatch) {
                            // Extract only digits from this section
                            const digitMatch = referensiSectionMatch[1].match(/(\d{15,20})/);
                            if (digitMatch) {
                                referensi = digitMatch[1].trim();
                                console.log(`[Rename Faktur] Referensi detected (Pattern 4 - section extraction): ${referensi}`);
                            }
                        }
                    }
                    
                    if (referensi) {
                        console.log(`[Rename Faktur] ✓ Referensi scanning successful: ${referensi}`);
                    } else {
                        console.log(`[Rename Faktur] ✗ Referensi not detected - using standard format without referensi`);
                    }
                    console.log(`[Rename Faktur] ========== END REFERENSI SCANNING ==========`);

                    // Create new filename based on referensi detection
                    let newName;
                    if (referensi) {
                        // Format with referensi: REFERENSI.pdf (simple & clean)
                        newName = `${referensi}.pdf`;
                        console.log(`[Rename Faktur] ✓ REFERENSI format applied: ${newName}`);
                    } else {
                        // Standard format: tax-NAMA NOMINAL (when referensi not found)
                        newName = `tax-${namaToko.toUpperCase()} ${formatCurrency(totalNominal)}.pdf`;
                        console.log(`[Rename Faktur] ✓ STANDARD format applied (no referensi): ${newName}`);
                    }

                    // Convert PDF file to base64 for download
                    const fileBase64 = fileData.toString('base64');

                    // Return success with new filename and file data
                    // Client will download file without server storage
                    res.json({
                        success: true,
                        originalName: fileName,
                        newName,
                        namaToko,
                        harga,
                        ppn,
                        totalNominal,
                        referensi: referensi || null,  // Include referensi in response
                        fileData: fileBase64  // Base64 encoded PDF file
                    });

                } catch (err) {
                    console.error('[Rename Faktur] Processing error:', err.message, err.stack);
                    res.status(500).json({
                        error: 'Gagal memproses PDF: ' + err.message,
                        details: process.env.NODE_ENV === 'production' ? undefined : err.stack
                    });
                }
            });

            req.pipe(bb);

        } catch (err) {
            console.error('[Rename Faktur] Request error:', err.message, err.stack);
            res.status(500).json({
                error: 'Gagal memproses request: ' + err.message,
                details: process.env.NODE_ENV === 'production' ? undefined : err.stack
            });
        }
    });
};

// ============================================
// Helper Functions
// ============================================

function cleanNumber(str) {
    // Remove currency formatting: 4.410.720,00 -> 4410720
    // Handle both Indonesian (. as thousands, , as decimal) and US (,as thousands, . as decimal) formats
    if (!str) return 0;
    
    str = str.trim();
    console.log(`[cleanNumber] Input: "${str}"`);
    
    // Remove spaces
    str = str.replace(/\s/g, '');
    
    // Check if this is Indonesian format (last separator is comma for decimals)
    // or US format (last separator is period for decimals)
    const lastCommaPos = str.lastIndexOf(',');
    const lastPeriodPos = str.lastIndexOf('.');
    
    let cleaned;
    if (lastCommaPos > lastPeriodPos) {
        // Indonesian format: 4.410.720,00 -> remove periods, replace comma with nothing for integer
        cleaned = str.replace(/\./g, '').replace(/,/, '');
    } else if (lastPeriodPos > lastCommaPos) {
        // US format: 4,410,720.00 -> remove commas, replace period with nothing for integer
        cleaned = str.replace(/,/g, '').replace(/\./, '');
    } else {
        // No separator, just remove all non-digits except last 2 (for decimals if any)
        cleaned = str.replace(/[^0-9]/g, '');
    }
    
    const result = parseInt(cleaned) || 0;
    console.log(`[cleanNumber] Output: ${result}`);
    return result;
}

function formatCurrency(num) {
    // Format: 4896000 -> 4.896.000 (remove last 2 digits as user requested)
    // Divide by 100 to remove cents, then format with thousands separator
    const withoutCents = Math.floor(num / 100);
    return withoutCents.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
