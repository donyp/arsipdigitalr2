const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdf = require('pdf-parse');
const { parse } = require('json2csv');
const { createClient } = require('@supabase/supabase-js');

// Create Supabase client (same pattern as other endpoints)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    }
});

// ============================================================
// PARSERS
// ============================================================

function cleanNumber(str) {
    if (!str) return '';
    return parseFloat(str.replace(/,/g, '').trim()) || 0;
}

function detectBank(text) {
    const textUpper = text.toUpperCase();
    const textCompact = textUpper.replace(/\s+/g, '');
    
    // BSI Detection - Check for unique BSI identifiers
    if (textCompact.includes('BSIBANKSYARIAHINDONESIA') || 
        textUpper.includes('BSI BANK SYARIAH INDONESIA') ||
        (textUpper.includes('BANK SYARIAH INDONESIA') && textUpper.includes('ACCOUNT STATEMENT')) ||
        textCompact.includes('7143455356') // Example BSI account pattern
    ) {
        console.log('[PDF-to-CSV] Detected: Bank Syariah Indonesia (BSI)');
        return 'bsi';
    }
    
    // Bank Muamalat Detection
    if (textUpper.includes('MUAMALAT TOWER') || 
        textUpper.includes('BANK MUAMALAT') ||
        (textUpper.includes('ACCOUNT TYPE') && textUpper.includes('GIRO IB')) ||
        (textUpper.includes('REFERENCE NUMBER') && textUpper.includes('TRANSACTION DATE') && textUpper.includes('EFFECTIVE DATE'))
    ) {
        console.log('[PDF-to-CSV] Detected: Bank Muamalat');
        return 'muamalat';
    }
    
    // BCA Detection - Most common patterns
    if (textUpper.includes('REKENING GIRO') || 
        textUpper.includes('BANK CENTRAL ASIA') ||
        (textUpper.includes('BCA') && (textUpper.includes('KCP') || textUpper.includes('MUTASI'))) ||
        (textUpper.includes('TANGGAL') && textUpper.includes('KETERANGAN') && textUpper.includes('CBG') && textUpper.includes('SALDO'))
    ) {
        console.log('[PDF-to-CSV] Detected: Bank Central Asia (BCA)');
        return 'bca';
    }
    
    // Fallback with loose patterns
    if (textUpper.includes('BSI')) {
        console.log('[PDF-to-CSV] Detected (fallback): BSI');
        return 'bsi';
    }
    if (textUpper.includes('MUAMALAT')) {
        console.log('[PDF-to-CSV] Detected (fallback): Muamalat');
        return 'muamalat';
    }
    if (textUpper.includes('BCA')) {
        console.log('[PDF-to-CSV] Detected (fallback): BCA');
        return 'bca';
    }
    
    console.log('[PDF-to-CSV] Bank detection failed - unknown format');
    return 'unknown';
}

function parseBCA(text) {
    const lines = text.split('\n');
    const transactions = [];

    // Lines to skip entirely
    const skipPatterns = [
        /^TANGGALKETERANGANCBGMUTASISALDO/,
        /^SALDO AWAL:/,
        /^MUTASI (CR|DB):/,
        /^SALDO AKHIR:/,
        /^Bersambung ke Halaman/,
        /^\d+\/\d+$/,                           // page numbers like "1/2"
        /^KCP\s/,
        /^REKENING GIRO/,
        /^GARUDA GEMILANG|^JATIBENING|^GEDUNG|^JL\s|^BEKASI|^INDONESIA$/i,
        /^NO\. REKENING:|^HALAMAN:|^PERIODE:|^MATA UANG:/,
        /^CATATAN:/,
        /^Apabila nasabah|^dengan akhir bulan|^tercantum pada/,
        /^BCA berhak|^Rekening\.$/,
        /^\s*•\s*$/,
        /^\s*$/,
    ];

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = raw.trim();
        if (!line) continue;
        if (skipPatterns.some(p => p.test(line))) continue;

        // BCA format: semua kolom menyatu tanpa spasi
        // Pattern: DD/MM + keterangan + [CBG] + mutasi + [DB|CR] + [saldo]
        // 
        // Examples:
        // "01/06SALDO AWAL9,161,912.00"
        // "08/06SETORAN TUNAI7510100,000,000.00109,161,912.00"
        // "08/06TRSF E-BANKING DB0806/FTSCY/WS9505123,625,000.00DB"
        // "08/06TRSF E-BANKING DB0806/FTSCY/WS9505111,125,000.00DB801,912.00"
        // "30/06BIAYA ADM30,000.00DB8,213,931.00"

        const dateMatch = line.match(/^(\d{2}\/\d{2})(.*)/);
        if (!dateMatch) continue;

        const [, tgl, rest] = dateMatch;

        // Extract all numbers from the rest (commas as thousands, dot as decimal)
        const numbers = [];
        const numReg = /[\d,]+\.\d{2}/g;
        let m;
        while ((m = numReg.exec(rest)) !== null) {
            numbers.push({ val: cleanNumber(m[0]), idx: m.index });
        }

        // Detect DB/CR flag
        const isDB = /\bDB\b/.test(rest);
        const isCR = /\bCR\b/.test(rest);

        // Extract description: strip numbers, DB/CR, CBG codes, extra spaces
        let desc = rest
            .replace(/[\d,]+\.\d{2}/g, '')    // remove numbers like 1,234.56
            .replace(/\bDB\b|\bCR\b/g, '')     // remove DB/CR
            .replace(/\b\d{4}\b/g, '')          // remove 4-digit CBG
            .replace(/\s{2,}/g, ' ')
            .trim();

        let mutasi = 0, saldo = 0, debit = '', kredit = '';

        if (numbers.length === 0) {
            // No numbers — skip or continuation
            continue;
        } else if (numbers.length === 1) {
            // Only saldo (SALDO AWAL) or only mutasi
            if (!isDB && !isCR) {
                saldo = numbers[0].val;
            } else {
                mutasi = numbers[0].val;
                if (isDB) debit = mutasi;
                else kredit = mutasi;
            }
        } else if (numbers.length === 2) {
            // mutasi + saldo
            mutasi = numbers[0].val;
            saldo  = numbers[1].val;
            if (isDB) debit = mutasi;
            else if (isCR) kredit = mutasi;
            else kredit = mutasi; // credit if no flag (setoran)
        } else {
            // 3+ numbers: last is saldo, second-last is mutasi, rest part of CBG/ref
            mutasi = numbers[numbers.length - 2].val;
            saldo  = numbers[numbers.length - 1].val;
            if (isDB) debit = mutasi;
            else kredit = mutasi;
        }

        transactions.push({
            'Tanggal': tgl,
            'Keterangan': desc || rest.trim(),
            'Debit':   debit,
            'Kredit':  kredit,
            'Saldo':   saldo
        });
    }

    return transactions;
}

function parseBSI(text) {
    const lines = text.split('\n');
    const transactions = [];
    let current = null;

    const skipPatterns = [
        /^BSI|^BANK SYARIAH INDONESIA/i,
        /^Account Statement/i,
        /^PT\s+GARUDA/i,
        /^Account\s*:/i,
        /^Date\s*:/i,
        /^Opening Balance/i,
        /^Closing Balance/i,
        /^Total (Debit|Credit)/i,
        /^Branch\s*:/i,
        /^Date\s+FT Number/i,
        /^Currency\s+Amount/i,
    ];

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        if (skipPatterns.some(p => p.test(line))) continue;

        // BSI format from screenshot:
        // "2026-06-01 10:18:30 FT2615220XMD BIFAST - TRF Dari - Bank BCA ... IDR 21,819,082.00 CR 194,664,677.83"
        // pdf-parse typically collapses columns — try several patterns

        // Pattern 1: YYYY-MM-DD HH:MM:SS  FTxxx  description  IDR  amount  CR/DB  balance
        const m1 = line.match(/^(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}\s+(\S+)\s+(.*?)\s+IDR\s+([\d,.]+(?:\.\d{2})?)\s+(CR|DB)\s+([\d,.]+(?:\.\d{2})?)$/i);
        if (m1) {
            if (current) transactions.push(current);
            const [, date, ftNum, desc, amount, type, balance] = m1;
            current = {
                'Tanggal': date,
                'No. FT': ftNum,
                'Keterangan': desc.trim(),
                'Debit':   type === 'DB' ? cleanNumber(amount) : '',
                'Kredit':  type === 'CR' ? cleanNumber(amount) : '',
                'Saldo':   cleanNumber(balance)
            };
            continue;
        }

        // Pattern 2: YYYY-MM-DD HH:MM:SS  FTxxx  ... (balance at end, no CR/DB label)
        const m2 = line.match(/^(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}\s+(\S+)\s+(.*?)\s+([\d,.]+(?:\.\d{2})?)\s+([\d,.]+(?:\.\d{2})?)$/);
        if (m2) {
            if (current) transactions.push(current);
            const [, date, ftNum, desc, amount, balance] = m2;
            current = {
                'Tanggal': date,
                'No. FT': ftNum,
                'Keterangan': desc.trim(),
                'Debit':  '',
                'Kredit': cleanNumber(amount),
                'Saldo':  cleanNumber(balance)
            };
            continue;
        }

        // Pattern 3: date only (YYYY-MM-DD) without time
        const m3 = line.match(/^(\d{4}-\d{2}-\d{2})\s+(\S+)\s+(.*?)\s+([\d,.]+(?:\.\d{2})?)\s+(CR|DB)\s+([\d,.]+(?:\.\d{2})?)$/i);
        if (m3) {
            if (current) transactions.push(current);
            const [, date, ftNum, desc, amount, type, balance] = m3;
            current = {
                'Tanggal': date,
                'No. FT': ftNum,
                'Keterangan': desc.trim(),
                'Debit':  type === 'DB' ? cleanNumber(amount) : '',
                'Kredit': type === 'CR' ? cleanNumber(amount) : '',
                'Saldo':  cleanNumber(balance)
            };
            continue;
        }

        // Continuation
        if (current && !line.match(/^[\d,. ]+$/)) {
            current['Keterangan'] += ' ' + line;
        }
    }
    if (current) transactions.push(current);
    return transactions.filter(t => t['Tanggal']);
}

function parseMuamalat(text) {
    const lines = text.split('\n');
    const transactions = [];
    let current = null;

    const skipPatterns = [
        /^Muamalat|^BANK MUAMALAT/i,
        /^ACCOUNT STATEMENT/i,
        /^GARUDA GEMILANG/i,
        /^JL\s/i,
        /^Jakarta/i,
        /^Account No\./i,
        /^Account Type/i,
        /^Currency\s*:/i,
        /^Period\s*:/i,
        /^Reference\s+Number/i,
        /^Transaction\s+Date/i,
        /^Effective\s+Date/i,
        /^Debit\s+Credit/i,
        /^Balance\s+Description/i,
    ];

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        if (skipPatterns.some(p => p.test(line))) continue;

        // Muamalat format from screenshot:
        // "000DBJL261530652 02-Jun-2026 30-May-2026   2,000,000.00          120,108,077.00 6019233200024576 BMICMS01..."
        // Columns: RefNum  TrxDate  EffDate  [Debit]  [Credit]  Balance  Description

        // Pattern: refnum  dd-Mon-yyyy  dd-Mon-yyyy  number  number  rest
        const m1 = line.match(/^([A-Z0-9]{8,})\s+(\d{2}-[A-Za-z]{3}-\d{4})\s+(\d{2}-[A-Za-z]{3}-\d{4})\s+([\d,.]+(?:\.\d{2})?)\s+([\d,.]+(?:\.\d{2})?)\s*(.*)/);
        if (m1) {
            if (current) transactions.push(current);
            const [, refNum, trxDate, effDate, col1, col2, desc] = m1;
            // Need to figure out debit vs credit: 
            // If balance in col2 is bigger than prev balance → credit, else debit
            const amt1 = cleanNumber(col1);
            const amt2 = cleanNumber(col2);
            const prevBalance = transactions.length > 0 ? (transactions[transactions.length-1]['Saldo'] || 0) : 0;
            let debit = '', kredit = '', saldo = 0;
            
            // col2 is likely balance (larger number), col1 is transaction amount
            if (amt2 > amt1) {
                saldo = amt2;
                if (saldo > prevBalance) { kredit = amt1; }
                else { debit = amt1; }
            } else {
                // both similar — col1=amount, col2=balance
                saldo = amt2;
                debit = amt1;
            }

            current = {
                'Tanggal Transaksi': trxDate,
                'Tanggal Efektif':   effDate,
                'Nomor Referensi':   refNum,
                'Keterangan':        desc.trim(),
                'Debit':             debit,
                'Kredit':            kredit,
                'Saldo':             saldo
            };
            continue;
        }

        // Pattern 2: refnum + one date (pdf-parse collapsed columns)
        const m2 = line.match(/^([A-Z0-9]{8,})\s+(\d{2}-[A-Za-z]{3}-\d{4})\s+(.*?)\s+([\d,.]+(?:\.\d{2})?)\s+([\d,.]+(?:\.\d{2})?)$/);
        if (m2) {
            if (current) transactions.push(current);
            const [, refNum, date, desc, amt, bal] = m2;
            const prevBalance = transactions.length > 0 ? (transactions[transactions.length-1]['Saldo'] || 0) : 0;
            const saldo = cleanNumber(bal);
            const amount = cleanNumber(amt);
            current = {
                'Tanggal Transaksi': date,
                'Tanggal Efektif':   date,
                'Nomor Referensi':   refNum,
                'Keterangan':        desc.trim(),
                'Debit':             saldo < prevBalance ? amount : '',
                'Kredit':            saldo >= prevBalance ? amount : '',
                'Saldo':             saldo
            };
            continue;
        }

        // Continuation
        if (current && !line.match(/^[\d,. ]+$/)) {
            current['Keterangan'] += ' ' + line;
        }
    }
    if (current) transactions.push(current);
    return transactions.filter(t => t['Tanggal Transaksi']);
}

// ============================================================
// ROUTES - authenticateToken diinjeksi dari server.js
// ============================================================

module.exports = function registerPdfToCsvEndpoints(app, authenticateToken) {

    // POST /api/pdf-to-csv/debug - Dump raw PDF text (dev use)
    app.post('/api/pdf-to-csv/debug', authenticateToken, upload.single('pdf'), async (req, res) => {
        try {
            let buffer;
            
            // Support both multipart file upload AND base64 JSON body
            if (req.file) {
                buffer = req.file.buffer;
            } else if (req.body && req.body.base64) {
                buffer = Buffer.from(req.body.base64, 'base64');
            } else {
                return res.status(400).json({ 
                    error: 'No file provided. Send as multipart OR JSON {base64: "..."}',
                    tip: 'Make sure to select a file before running the debug command'
                });
            }
            
            let pdfData;
            try {
                pdfData = await pdf(buffer);
            } catch (pdfErr) {
                // Return the actual pdf-parse error so we can diagnose
                return res.status(422).json({
                    error: 'pdf-parse failed',
                    pdfError: pdfErr.message,
                    pdfErrorType: pdfErr.constructor.name,
                    tip: 'PDF may be password-protected, corrupted, or use an unsupported font/encoding',
                    bufferSize: buffer.length,
                    // Show first bytes as hex to check PDF header
                    headerHex: buffer.slice(0, 16).toString('hex'),
                    headerStr: buffer.slice(0, 8).toString('ascii')
                });
            }

            const rawText = pdfData.text;
            const lines = rawText.split('\n').map((l, i) => `${i}: ${JSON.stringify(l)}`);
            res.json({
                pageCount: pdfData.numpages,
                totalChars: rawText.length,
                detectedBank: detectBank(rawText),
                rawTextPreview: rawText.substring(0, 3000),
                lines: lines.slice(0, 150)
            });
        } catch (e) {
            res.status(500).json({ error: e.message, stack: e.stack?.split('\n').slice(0,5) });
        }
    });

    // POST /api/pdf-to-csv/detect - Detect bank without converting
    app.post('/api/pdf-to-csv/detect', authenticateToken, upload.single('pdf'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'Tidak ada file PDF yang diupload' });
            }

            console.log(`[PDF-to-CSV] Detect request for: ${req.file.originalname}`);

            // Parse PDF
            const pdfData = await pdf(req.file.buffer);
            const text = pdfData.text;
            const pageCount = pdfData.numpages;

            if (!text || text.length < 50) {
                return res.status(400).json({ 
                    error: 'PDF kosong atau tidak dapat dibaca',
                    detected: false
                });
            }

            // Detect bank
            const bank = detectBank(text);
            
            const bankNames = {
                'bca': 'Bank Central Asia (BCA)',
                'bsi': 'Bank Syariah Indonesia (BSI)',
                'muamalat': 'Bank Muamalat',
                'unknown': 'Tidak Dikenali'
            };

            const response = {
                success: true,
                detected: bank !== 'unknown',
                bank: bank,
                bankName: bankNames[bank] || 'Tidak Dikenali',
                pageCount: pageCount,
                fileSize: req.file.size,
                fileName: req.file.originalname
            };

            console.log(`[PDF-to-CSV] Detection result: ${bankNames[bank]}`);
            res.json(response);

        } catch (error) {
            console.error('[PDF-to-CSV] Detect error:', error);
            res.status(500).json({ 
                error: 'Gagal mendeteksi bank', 
                message: error.message,
                detected: false
            });
        }
    });

    // POST /api/pdf-to-csv/convert
    app.post('/api/pdf-to-csv/convert', authenticateToken, upload.single('pdf'), async (req, res) => {
        const startTime = Date.now();

        try {
            if (!req.file) {
                return res.status(400).json({ error: 'Tidak ada file PDF yang diupload' });
            }

            const userId = req.user.userId;
            const userEmail = req.user.email;

            console.log(`[PDF-to-CSV] Convert request: user=${userEmail}`);

            // Parse PDF
            const pdfData = await pdf(req.file.buffer);
            const text = pdfData.text;
            const pageCount = pdfData.numpages;

            if (!text || text.length < 50) {
                await logConversion(supabase, {
                    user_id: userId, user_email: userEmail, bank: 'unknown',
                    original_filename: req.file.originalname,
                    file_size: req.file.size, page_count: pageCount,
                    csv_filename: '', status: 'failed',
                    error_message: 'PDF kosong atau tidak dapat dibaca',
                    processing_time_ms: Date.now() - startTime,
                    ip_address: req.ip, user_agent: req.headers['user-agent']
                });
                return res.status(400).json({ error: 'PDF kosong atau tidak dapat dibaca' });
            }

            // Auto-detect bank or use provided bank
            let bank = req.body.bank ? req.body.bank.toLowerCase() : null;
            
            if (!bank || bank === 'auto') {
                bank = detectBank(text);
                console.log(`[PDF-to-CSV] Auto-detected bank: ${bank}`);
            } else {
                console.log(`[PDF-to-CSV] Using user-specified bank: ${bank}`);
            }

            if (bank === 'unknown') {
                await logConversion(supabase, {
                    user_id: userId, user_email: userEmail, bank: 'unknown',
                    original_filename: req.file.originalname,
                    file_size: req.file.size, page_count: pageCount,
                    csv_filename: '', status: 'failed',
                    error_message: 'Tidak dapat mendeteksi format bank. Bank tidak dikenali.',
                    processing_time_ms: Date.now() - startTime,
                    ip_address: req.ip, user_agent: req.headers['user-agent']
                });
                return res.status(400).json({ 
                    error: 'Format PDF tidak dikenali', 
                    message: 'Sistem tidak dapat mendeteksi bank dari PDF. Pastikan PDF adalah mutasi bank dari BCA, BSI, atau Muamalat.' 
                });
            }

            // Parse transactions
            let transactions = [];
            let bankName = '';

            switch (bank) {
                case 'bca':
                    transactions = parseBCA(text);
                    bankName = 'BCA';
                    break;
                case 'bsi':
                    transactions = parseBSI(text);
                    bankName = 'BSI';
                    break;
                case 'muamalat':
                    transactions = parseMuamalat(text);
                    bankName = 'Muamalat';
                    break;
                default:
                    return res.status(400).json({ error: 'Bank tidak didukung. Pilih: bca, bsi, atau muamalat' });
            }

            if (transactions.length === 0) {
                await logConversion(supabase, {
                    user_id: userId, user_email: userEmail, bank,
                    original_filename: req.file.originalname,
                    file_size: req.file.size, page_count: pageCount,
                    csv_filename: '', status: 'failed',
                    error_message: 'Tidak ada transaksi ditemukan dalam PDF',
                    processing_time_ms: Date.now() - startTime,
                    ip_address: req.ip, user_agent: req.headers['user-agent']
                });
                return res.status(400).json({ error: 'Tidak ada transaksi ditemukan. Pastikan bank yang dipilih sesuai.' });
            }

            console.log(`[PDF-to-CSV] Found ${transactions.length} transactions from ${bankName}`);

            // Convert to CSV with BOM for Excel
            const csv = parse(transactions);
            const date = new Date().toISOString().split('T')[0];
            const filename = `MUTASI_${bankName}_${date}.csv`;
            const processingTime = Date.now() - startTime;

            // Save to history
            await logConversion(supabase, {
                user_id: userId, user_email: userEmail, bank,
                original_filename: req.file.originalname,
                file_size: req.file.size, page_count: pageCount,
                transaction_count: transactions.length,
                csv_filename: filename, status: 'success',
                processing_time_ms: processingTime,
                ip_address: req.ip, user_agent: req.headers['user-agent']
            });

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send('\uFEFF' + csv);

        } catch (error) {
            console.error('[PDF-to-CSV] Convert error:', error);

            // Try log error
            try {
                await logConversion(supabase, {
                    user_id: req.user.userId,
                    user_email: req.user.email,
                    bank: req.body.bank || 'unknown',
                    original_filename: req.file?.originalname || 'unknown',
                    file_size: req.file?.size || 0,
                    csv_filename: '', status: 'failed',
                    error_message: error.message,
                    processing_time_ms: Date.now() - startTime,
                    ip_address: req.ip, user_agent: req.headers['user-agent']
                });
            } catch (_) {}

            res.status(500).json({ error: 'Gagal mengkonversi PDF', message: error.message });
        }
    });

    // GET /api/pdf-to-csv/history
    app.get('/api/pdf-to-csv/history', authenticateToken, async (req, res) => {
        try {
            const userId = req.user.userId;

            const { data, error } = await supabase
                .from('pdf_conversions')
                .select('id, bank, original_filename, file_size, page_count, transaction_count, csv_filename, status, error_message, processing_time_ms, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) {
                console.error('[PDF-to-CSV] History query error:', error);
                return res.status(500).json({ error: 'Gagal mengambil riwayat konversi' });
            }

            res.json({ success: true, history: data || [] });

        } catch (error) {
            console.error('[PDF-to-CSV] History error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/pdf-to-csv/stats (moderator/super_admin only)
    app.get('/api/pdf-to-csv/stats', authenticateToken, async (req, res) => {
        try {
            const role = req.user.role;
            if (role !== 'super_admin' && role !== 'moderator') {
                return res.status(403).json({ error: 'Akses ditolak' });
            }

            const { data: totals, error } = await supabase
                .from('pdf_conversions')
                .select('id, status, bank');

            if (error) throw error;

            const stats = {
                total: totals?.length || 0,
                success: totals?.filter(t => t.status === 'success').length || 0,
                failed: totals?.filter(t => t.status === 'failed').length || 0,
                by_bank: {
                    bca: totals?.filter(t => t.bank === 'bca').length || 0,
                    bsi: totals?.filter(t => t.bank === 'bsi').length || 0,
                    muamalat: totals?.filter(t => t.bank === 'muamalat').length || 0
                }
            };

            res.json({ success: true, stats });

        } catch (error) {
            console.error('[PDF-to-CSV] Stats error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/pdf-to-csv/health
    app.get('/api/pdf-to-csv/health', (req, res) => {
        res.json({ status: 'ok', service: 'pdf-to-csv' });
    });

    console.log('[INIT] PDF to CSV endpoints registered ✅');
    console.log('  ✓ POST /api/pdf-to-csv/detect');
    console.log('  ✓ POST /api/pdf-to-csv/convert');
    console.log('  ✓ GET  /api/pdf-to-csv/history');
    console.log('  ✓ GET  /api/pdf-to-csv/stats');
};

// Helper: save conversion log to DB
async function logConversion(supabase, data) {
    try {
        const { error } = await supabase.from('pdf_conversions').insert(data);
        if (error) console.error('[PDF-to-CSV] Log error:', error.message);
    } catch (e) {
        console.error('[PDF-to-CSV] Log exception:', e.message);
    }
}
