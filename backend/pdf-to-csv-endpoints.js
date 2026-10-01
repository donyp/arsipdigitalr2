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
    const transactions = [];

    // BSI: semua kolom menyatu dalam 1 baris tanpa spasi
    // "2026-06-01 10:18:30FT2615220XMDBIFAST - TRF Dari...IDR21,819,082.00CR194,664,677.83"
    // Pattern: YYYY-MM-DD HH:MM:SS + FTxxxx + desc + IDR + amount + CR/DB + balance
    const lineReg = /(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}(FT[A-Z0-9\\]+)(.*?)IDR([\d,]+\.\d{2})(CR|DB)([\d,]+\.\d{2})/g;

    let m;
    while ((m = lineReg.exec(text)) !== null) {
        const [, date, ftNum, desc, amount, type, balance] = m;
        transactions.push({
            'Tanggal': date,
            'No. FT': ftNum.replace(/\\BNK$/, ''),
            'Keterangan': desc.trim(),
            'Debit':  type === 'DB' ? cleanNumber(amount) : '',
            'Kredit': type === 'CR' ? cleanNumber(amount) : '',
            'Saldo':  cleanNumber(balance)
        });
    }

    return transactions;
}

function parseMuamalat(text) {
    const transactions = [];

    // Muamalat: setiap field ada di baris TERPISAH
    // Urutan per transaksi:
    //   1. RefNum  -> baris seperti "000DBJL261530652"
    //   2. Trx Date -> "02-Jun-2026"
    //   3. Eff Date -> "30-May-2026"
    //   4. Amount  -> "2,000,000.00"
    //   5. Balance -> "120,108,077.00"
    //   6. Description (bisa multi-line sampai refnum berikutnya)

    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    const skipPatterns = [
        /^ACCOUNT STATEMENT$/i,
        /^Muamalat Tower/i,
        /^Account No\.$/i,
        /^:$/,
        /^Account Type$/i,
        /^Currency$/i,
        /^IDR$/,
        /^Period$/i,
        /^\d{2}-[A-Za-z]{3}-\d{4}\s+to\s+\d{2}-[A-Za-z]{3}-\d{4}/,
        /^GARUDA GEMILANG/i,
        /^JL\s/i,
        /^Description$/i,
        /^Balance$/i,
        /^Credit$/i,
        /^Debit$/i,
        /^Effective$/i,
        /^Date$/i,
        /^Transaction$/i,
        /^Reference$/i,
        /^Number$/i,
        /^Page$/i,
        /^of$/i,
        /^\d+$/,
        /^All Rights Reserved/i,
        /^GIRO IB/i,
        /^TRANSFER CMS$/i,
        /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/,
    ];

    const isRefNum = l => /^[A-Z0-9]{8,}$/.test(l) && /\d/.test(l) && /[A-Z]/.test(l) && !/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(l);
    const isDate   = l => /^\d{2}-[A-Za-z]{3}-\d{4}$/.test(l);
    const isAmount = l => /^[\d,]+\.\d{2}$/.test(l);

    let state = 'seek';
    let cur = null;
    let prevBalance = 0;

    const pushCur = () => {
        if (!cur || !cur.amount) return;
        const isDebit = cur.balance < prevBalance;
        transactions.push({
            'Tanggal Transaksi': cur.trxDate,
            'Tanggal Efektif':   cur.effDate,
            'Nomor Referensi':   cur.refNum,
            'Keterangan':        cur.desc.replace(/\s+/g, ' ').trim(),
            'Debit':             isDebit ? cur.amount : '',
            'Kredit':            isDebit ? '' : cur.amount,
            'Saldo':             cur.balance
        });
        prevBalance = cur.balance;
    };

    for (const line of lines) {
        if (skipPatterns.some(p => p.test(line))) continue;

        if (state === 'seek' || state === 'desc') {
            if (isRefNum(line)) {
                pushCur();
                cur = { refNum: line, trxDate: '', effDate: '', amount: 0, balance: 0, desc: '' };
                state = 'trxdate';
                continue;
            }
            if (state === 'desc' && cur) {
                cur.desc += ' ' + line;
            }
            continue;
        }
        if (state === 'trxdate') { if (isDate(line)) { cur.trxDate = line; state = 'effdate'; } continue; }
        if (state === 'effdate') { if (isDate(line)) { cur.effDate = line; state = 'amount';  } continue; }
        if (state === 'amount')  { if (isAmount(line)) { cur.amount  = cleanNumber(line); state = 'balance'; } continue; }
        if (state === 'balance') { if (isAmount(line)) { cur.balance = cleanNumber(line); state = 'desc';    } continue; }
    }
    pushCur();

    return transactions;
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
