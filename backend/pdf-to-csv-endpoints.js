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
    let current = null;

    const skip = ['REKENING KORAN', 'BANK CENTRAL ASIA', 'Tanggal', 'Keterangan', 'CBG', 'MUTASI', 'SALDO', 'Page'];

    for (let line of lines) {
        line = line.trim();
        if (!line || skip.some(s => line.includes(s))) continue;

        // BCA pattern: DD/MM  amount  [DB/CR]  description
        const match = line.match(/^(\d{2}\/\d{2})\s+([\d,.]+)\s+(DB|CR)?\s*(.*)/);
        if (match) {
            if (current) transactions.push(current);
            const [, date, amount, type, desc] = match;
            current = {
                'Tanggal': date,
                'Keterangan': desc.trim(),
                'Debit': type === 'DB' ? cleanNumber(amount) : '',
                'Kredit': type === 'CR' ? cleanNumber(amount) : '',
                'Saldo': ''
            };
        } else if (current) {
            current['Keterangan'] += ' ' + line.trim();
        }
    }
    if (current) transactions.push(current);
    return transactions;
}

function parseBSI(text) {
    const lines = text.split('\n');
    const transactions = [];
    let current = null;

    const skip = ['BANK SYARIAH', 'Statement', 'Date', 'Description', 'Debit', 'Credit', 'Balance', 'Page'];

    for (let line of lines) {
        line = line.trim();
        if (!line || skip.some(s => line.includes(s))) continue;

        // BSI pattern: DD-MMM-YYYY  description  debit  credit  balance
        const match = line.match(/^(\d{2}-\w{3}-\d{4})\s+(.*?)\s+([\d,.]+\.\d{2})?\s+([\d,.]+\.\d{2})?\s+([\d,.]+\.\d{2})$/);
        if (match) {
            if (current) transactions.push(current);
            const [, date, desc, debit, credit, balance] = match;
            current = {
                'Tanggal': date,
                'Keterangan': desc.trim(),
                'Debit': debit ? cleanNumber(debit) : '',
                'Kredit': credit ? cleanNumber(credit) : '',
                'Saldo': balance ? cleanNumber(balance) : ''
            };
        } else if (current && !line.match(/^\d{2}-\w{3}-\d{4}/)) {
            current['Keterangan'] += ' ' + line.trim();
        }
    }
    if (current) transactions.push(current);
    return transactions;
}

function parseMuamalat(text) {
    const lines = text.split('\n');
    const transactions = [];
    let current = null;

    const skip = ['MUAMALAT', 'Account No', 'Period', 'Transaction Date', 'Effective Date', 'Reference Number', 'Description', 'Amount', 'Balance', 'Page'];

    for (let line of lines) {
        line = line.trim();
        if (!line || skip.some(s => line.includes(s))) continue;

        // Muamalat pattern: REFNUM  eff-date  trx-date  amount  balance
        const match = line.match(/^([0-9A-Z]{10,})\s+(\d{2}-\w{3}-\d{4})\s+(\d{2}-\w{3}-\d{4})\s+([\d,.]+\.\d{2})\s+([\d,.]+\.\d{2})/);
        if (match) {
            if (current) transactions.push(current);
            const [, refNum, effDate, trxDate, amount, balance] = match;
            const cleanAmt = cleanNumber(amount);
            const cleanBal = cleanNumber(balance);
            const isDebit = transactions.length > 0 && cleanBal < (transactions[transactions.length - 1]['Saldo'] || 0);
            current = {
                'Tanggal Transaksi': trxDate,
                'Tanggal Efektif': effDate,
                'Nomor Referensi': refNum,
                'Keterangan': '',
                'Debit': isDebit ? cleanAmt : '',
                'Kredit': !isDebit ? cleanAmt : '',
                'Saldo': cleanBal
            };
        } else if (current && !line.match(/^[0-9A-Z]{10,}/)) {
            current['Keterangan'] += ' ' + line.trim();
        }
    }
    if (current) transactions.push(current);
    return transactions;
}

// ============================================================
// ROUTES - authenticateToken diinjeksi dari server.js
// ============================================================

module.exports = function registerPdfToCsvEndpoints(app, authenticateToken) {

    // POST /api/pdf-to-csv/debug - Dump raw PDF text (dev use)
    app.post('/api/pdf-to-csv/debug', authenticateToken, upload.single('pdf'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'No file' });
            const pdfData = await pdf(req.file.buffer);
            const lines = pdfData.text.split('\n').map((l, i) => `${i}: ${JSON.stringify(l)}`);
            res.json({
                pageCount: pdfData.numpages,
                totalChars: pdfData.text.length,
                detectedBank: detectBank(pdfData.text),
                lines: lines.slice(0, 120)   // first 120 lines
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
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
