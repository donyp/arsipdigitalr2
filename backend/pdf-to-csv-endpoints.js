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
    // Keep original format from PDF (e.g. "100,000,000.00") â€” just trim whitespace
    return str.toString().trim();
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

    const skipPatterns = [
        /^TANGGALKETERANGANCBGMUTASISALDO/,
        /^SALDO AWAL:/,
        /^MUTASI (CR|DB):/,
        /^SALDO AKHIR:/,
        /^Bersambung ke Halaman/,
        /^\d+\/\d+$/,
        /^KCP\s/,
        /^REKENING GIRO/,
        /^GARUDA GEMILANG|^JATIBENING|^GEDUNG|^JL\s|^BEKASI|^INDONESIA$/i,
        /^NO\. REKENING:|^HALAMAN:|^PERIODE:|^MATA UANG:/,
        /^CATATAN:/,
        /^Apabila nasabah|^dengan akhir bulan|^tercantum pada/,
        /^BCA berhak|^Rekening\.$/,
        /^\s*â€¢\s*$/,
        /^\s*$/,
    ];

    // Core insight from raw BCA text:
    // "08/06TRSF E-BANKING DB0806/FTSCY/WS9505123,625,000.00DB"
    //                                           ^^^^^^^^^^^^^^^^^
    // "WS95051" + "23,625,000.00" are glued together as "WS9505123,625,000.00"
    // 
    // Key observation: the money value in BCA always ends at the END of the line
    // (optionally followed by "DB" or "DB+saldo").
    // 
    // The money value itself ALWAYS starts with a digit that begins a valid
    // comma-group pattern. The boundary between ref-code digits and money is:
    //   ref digits: continuous digits with NO comma
    //   money: digit(s) + comma + 3 digits (the first comma-group)
    //
    // Algorithm:
    // 1. Strip trailing "DB[saldo]" → know it's a debit
    // 2. Find the money value at end: scan backwards from end to find
    //    the leftmost digit that is part of the rightmost money value
    //    = find first ",\d{3}" group and expand left to grab leading digits
    //    BUT only 1-3 leading digits (the comma-group start rule)

    // Extract the last valid money from end of string s
    // Handles glued ref codes like "WS9505123,625,000.00" → extract "23,625,000.00"
    // 
    // Strategy:
    // 1. Find rightmost .dd, walk LEFT collecting valid money digits+commas
    // 2. If letter before collected: use modulo formula (firstCommaPos+1) % 3 || 3
    //    (letter marks end of ref code, so all leading digits follow money rules)
    // 3. If no letter: try all 1-3 leading digit counts, pick LARGEST valid (no leading zero)
    function extractTrailingMoney(s) {
        const dotIdx = s.lastIndexOf('.');
        if (dotIdx < 0) return null;

        // Walk LEFT from decimal: collect digits and valid commas
        let i = dotIdx - 1;
        let collected = '';
        let digitsSinceComma = 0;
        let validCommaGroups = 0;

        let afterDot = s.slice(dotIdx);
        if (!/^\.\d{2}$/.test(afterDot)) return null; // Must be .dd

        // Walk left from before decimal point
        while (i >= 0) {
            const ch = s[i];
            if (/\d/.test(ch)) {
                collected = ch + collected;
                digitsSinceComma++;
                i--;
            } else if (ch === ',') {
                // Comma is valid only if followed by exactly 3 digits
                if (digitsSinceComma === 3) {
                    collected = ch + collected;
                    validCommaGroups++;
                    digitsSinceComma = 0;
                    i--;
                } else {
                    break; // Invalid comma-group, stop
                }
            } else {
                break; // Non-digit/comma, stop
            }
        }

        if (validCommaGroups === 0) return null; // No valid comma-groups
        if (!collected) return null;

        const firstCommaPos = collected.indexOf(',');
        if (firstCommaPos < 0) return null;

        // Check what's BEFORE collected in original string
        const charBeforeCollected = i >= 0 ? s[i] : '';
        const hasLetterBefore = /[A-Za-z]/.test(charBeforeCollected);

        // Check if it's a ref code pattern: 2 uppercase letters at word boundary
        let isRefCodePattern = false;
        if (i >= 2) {
            const before3 = s[i-2];
            const before2 = s[i-1];
            const before1 = s[i];
            if (/[A-Z]/.test(before2) && /[A-Z]/.test(before1) && !/[A-Za-z]/.test(before3)) {
                isRefCodePattern = true;
            }
        } else if (i === 1) {
            // At start of string with 2 uppercase letters
            const before2 = s[0];
            const before1 = s[1];
            if (/[A-Z]/.test(before2) && /[A-Z]/.test(before1)) {
                isRefCodePattern = true;
            }
        }

        let leadingDigits;
        if (isRefCodePattern && firstCommaPos > 3) {
            // BCA ref code: use modulo formula to split ref code from money
            // Examples: 7 → (8 % 3) = 2 ✓, 5 → (6 % 3) = 0 → 3 ✓
            const mod = (firstCommaPos + 1) % 3 || 3;
            leadingDigits = mod;
        } else {
            // Not a ref code, or firstCommaPos <= 3: use standard logic
            // Try 1-3 leading digits, pick LARGEST valid (no leading zero)
            leadingDigits = null;
            const maxTry = Math.min(3, firstCommaPos);

            for (let ld = maxTry; ld >= 1; ld--) {
                const idx = firstCommaPos - ld;
                if (idx < 0) continue;

                const candidate = collected.slice(idx);
                if (/^\d{1,3}(,\d{3})*$/.test(candidate) && !/^0/.test(candidate)) {
                    leadingDigits = ld;
                    break;
                }
            }
            if (leadingDigits === null) return null;
        }

        // Extract money
        const startIdx = firstCommaPos - leadingDigits;
        if (startIdx < 0) return null;

        const bestMoney = collected.slice(startIdx) + afterDot;
        if (!/^\d{1,3}(,\d{3})*\.\d{2}$/.test(bestMoney)) return null;

        const moneyStart = s.lastIndexOf(bestMoney);
        if (moneyStart < 0) return null;

        return { val: bestMoney, start: moneyStart };
    }

    // Find last money anchored to end of string
    function findLastMoney(s) {
        // Always use extractTrailingMoney which handles both clean and glued cases properly
        // The "clean" check in old code was too simplistic and matched invalid patterns
        return extractTrailingMoney(s);
    }

    function parseLine(rest) {
        let debit = '', kredit = '', saldo = '';
        let amounts = []; // track amounts for stripAmounts

        // Case A: ends with DB (optionally + saldo)
        const dbSuffix = rest.match(/DB(\d{1,3}(?:,\d{3})*\.\d{2})?$/);
        if (dbSuffix) {
            saldo = dbSuffix[1] || '';
            if (saldo) amounts.push(saldo);
            
            const beforeDB = rest.slice(0, rest.length - dbSuffix[0].length);
            const m = findLastMoney(beforeDB);
            if (m) {
                debit = m.val;
                amounts.push(debit);
            }
            return { debit, kredit, saldo, amounts };
        }

        // No DB: find last and second-to-last money
        const last = findLastMoney(rest);
        if (!last) return { debit, kredit, saldo, amounts };

        const beforeLast = rest.slice(0, last.start);
        const second = findLastMoney(beforeLast);

        if (second) {
            kredit = second.val;
            saldo  = last.val;
            amounts.push(kredit, saldo);
        } else {
            const beforeVal = rest.slice(0, last.start).toUpperCase();
            if (/SALDO\s*(AWAL|AKHIR)/.test(beforeVal)) {
                saldo = last.val;
                amounts.push(saldo);
            } else {
                kredit = last.val;
                amounts.push(kredit);
            }
        }
        return { debit, kredit, saldo, amounts };
    }

    function stripAmounts(rest, amountsToRemove = []) {
        let s = rest;
        
        // Add space after DB marker if not already there
        // "DB0906" → "DB 0906"
        s = s.replace(/DB(\S)/g, 'DB $1');
        
        // Remove trailing DB marker if present
        s = s.replace(/DB\s*$/, '').trim();
        
        // Remove the specific amounts that were extracted
        for (const amt of amountsToRemove) {
            // Try removing formatted version
            s = s.replace(amt, ' ').replace(/\s+/g, ' ').trim();
            
            // Also try removing unformatted version
            const unformatted = amt.replace(/,/g, '');
            if (unformatted !== amt) {
                s = s.replace(unformatted, ' ').replace(/\s+/g, ' ').trim();
            }
        }

        // Remove standalone 4-digit CBG (not part of ref codes like 0806/... or WS95051)
        s = s.replace(/(?<![\/\d])(\d{4})(?!\d|\/)/g, '');

        return s.replace(/\s+/g, ' ').trim();
    }

    let current = null;

    const pushCurrent = () => {
        if (current) {
            transactions.push({
                'Tanggal':    current.tgl,
                'Keterangan': current.ket.replace(/\s{2,}/g, ' ').trim(),
                'Debit':      current.debit,
                'Kredit':     current.kredit,
                'Saldo':      current.saldo
            });
        }
        current = null;
    };

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        if (skipPatterns.some(p => p.test(line))) continue;

        // Skip indented raw-number continuation lines (no commas, just digits+dot)
        // e.g. "       23625000.00"
        if (/^\s+[\d.]+\s*$/.test(raw)) continue;

        // New transaction: starts with DD/MM or D-Mon or DD-Mon format
        let dateMatch = line.match(/^(\d{2}\/\d{2})(.*)/);
        
        // Also support D-Mon or DD-Mon format (e.g., "6-Jan", "13-Aug")
        if (!dateMatch) {
            const monthTextMatch = line.match(/^(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(.*)$/i);
            if (monthTextMatch) {
                const day = monthTextMatch[1].padStart(2, '0');
                const monthText = monthTextMatch[2].toLowerCase();
                const monthMap = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
                const month = monthMap[monthText];
                if (month) {
                    const tgl = `${day}/${String(month).padStart(2, '0')}`;
                    const rest = monthTextMatch[3];
                    dateMatch = [null, tgl, rest]; // synthetic match
                }
            }
        }
        
        if (dateMatch) {
            pushCurrent();

            const [, tgl, rest] = dateMatch;
            const { debit, kredit, saldo, amounts } = parseLine(rest);

            // Keterangan: remove the specific amounts that were extracted
            const ket = stripAmounts(rest, amounts)
                .replace(/\s{2,}/g, ' ')
                .trim();

            current = { tgl, ket, debit, kredit, saldo };

        } else if (current) {
            // Continuation line: append to keterangan
            // Skip pure unformatted numbers (visual duplicate like "23625000.00")
            if (/^\d[\d.]+$/.test(line)) continue;
            current.ket += ' ' + line;
        }
    }
    pushCurrent();

    return transactions;
}

function parseBSI(text) {
    const transactions = [];

    // BSI: semua kolom menyatu dalam 1 baris tanpa spasi
    // "2026-06-01 10:18:30FT2615220XMDBIFAST - TRF Dari...IDR21,819,082.00CR194,664,677.83"
    // Output columns: Tanggal | No. FT | Keterangan | Amount | DB/CR | Saldo
    const lineReg = /(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}(FT[A-Z0-9\\]+)(.*?)IDR([\d,]+\.\d{2})(CR|DB)([\d,]+\.\d{2})/g;

    let m;
    while ((m = lineReg.exec(text)) !== null) {
        const [, date, ftNum, desc, amount, type, balance] = m;
        transactions.push({
            'Tanggal':    date,
            'No. FT':     ftNum.replace(/\\BNK$/, ''),
            'Keterangan': desc.trim(),
            'Amount':     amount,    // keep original format e.g. "21,819,082.00"
            'DB/CR':      type,      // "CR" or "DB"
            'Saldo':      balance    // keep original format
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
        // Compare numerically to determine debit/credit
        const balNum  = parseFloat(cur.balance.replace(/,/g, ''));
        const prevNum = parseFloat((prevBalance || '0').toString().replace(/,/g, ''));
        const isDebit = balNum < prevNum;
        transactions.push({
            'Tanggal Transaksi': cur.trxDate,
            'Tanggal Efektif':   cur.effDate,
            'Nomor Referensi':   cur.refNum,
            'Keterangan':        cur.desc.replace(/\s+/g, ' ').trim(),
            'Mutasi':            cur.amount,   // original format "2,000,000.00"
            'DB/CR':             isDebit ? 'DB' : 'CR',
            'Saldo':             cur.balance   // original format "120,108,077.00"
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
        if (state === 'amount')  { if (isAmount(line)) { cur.amount  = line; state = 'balance'; } continue; }
        if (state === 'balance') { if (isAmount(line)) { cur.balance = line; state = 'desc';    } continue; }
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

    console.log('[INIT] PDF to CSV endpoints registered âœ…');
    console.log('  âœ“ POST /api/pdf-to-csv/detect');
    console.log('  âœ“ POST /api/pdf-to-csv/convert');
    console.log('  âœ“ GET  /api/pdf-to-csv/history');
    console.log('  âœ“ GET  /api/pdf-to-csv/stats');
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
