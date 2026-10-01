const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdf = require('pdf-parse');
const { parse } = require('json2csv');
const path = require('path');

// Configure multer for file upload (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    }
});

// Helper function to clean number strings
function cleanNumber(str) {
    if (!str) return '';
    return parseFloat(str.replace(/,/g, '').trim());
}

// Helper function to detect bank from PDF text
function detectBank(text) {
    const upperText = text.toUpperCase().replace(/\s/g, '');
    
    if (upperText.includes('BANKCENTRALASIA') || upperText.includes('REKENINGKORAN')) {
        return 'bca';
    }
    if (upperText.includes('BANKSYARIAHINDONESIA') || upperText.includes('STATEMENTOFACCOUNT')) {
        return 'bsi';
    }
    if (upperText.includes('MUAMALAT') || upperText.includes('REFERENCENUMBER')) {
        return 'muamalat';
    }
    
    return 'unknown';
}

// BCA Parser
function parseBCA(text) {
    const lines = text.split('\n');
    const transactions = [];
    let currentTransaction = null;

    const skipPatterns = [
        'REKENING KORAN',
        'BANK CENTRAL ASIA',
        'Page',
        'Tanggal',
        'Keterangan',
        'CBG',
        'MUTASI',
        'SALDO'
    ];

    for (let line of lines) {
        line = line.trim();
        if (!line || skipPatterns.some(p => line.includes(p))) continue;

        // Match BCA transaction pattern: date amount description
        const match = line.match(/^(\d{2}\/\d{2})\s+([\d,]+\.\d{2})\s+([A-Z]+)?\s*(.*)/);
        
        if (match) {
            if (currentTransaction) {
                transactions.push(currentTransaction);
            }

            const [, date, amount, type, desc] = match;
            const cleanAmount = cleanNumber(amount);

            currentTransaction = {
                'Tanggal': date,
                'Keterangan': desc.trim(),
                'Cabang': '',
                'Debit': type === 'DB' ? cleanAmount : '',
                'Kredit': type === 'CR' ? cleanAmount : '',
                'Saldo': ''
            };
        } else if (currentTransaction && line) {
            // Append to description
            currentTransaction['Keterangan'] += ' ' + line;
        }
    }

    if (currentTransaction) {
        transactions.push(currentTransaction);
    }

    return transactions;
}

// BSI Parser
function parseBSI(text) {
    const lines = text.split('\n');
    const transactions = [];
    let currentTransaction = null;

    const skipPatterns = [
        'BANK SYARIAH INDONESIA',
        'Statement of Account',
        'Date',
        'Description',
        'Debit',
        'Credit',
        'Balance',
        'Page'
    ];

    for (let line of lines) {
        line = line.trim();
        if (!line || skipPatterns.some(p => line.includes(p))) continue;

        // Match BSI pattern: date description debit credit balance
        const match = line.match(/^(\d{2}-\w{3}-\d{4})\s+(.*?)\s+([\d,]+\.\d{2})?\s+([\d,]+\.\d{2})?\s+([\d,]+\.\d{2})/);
        
        if (match) {
            if (currentTransaction) {
                transactions.push(currentTransaction);
            }

            const [, date, desc, debit, credit, balance] = match;

            currentTransaction = {
                'Tanggal': date,
                'Keterangan': desc.trim(),
                'Debit': debit ? cleanNumber(debit) : '',
                'Kredit': credit ? cleanNumber(credit) : '',
                'Saldo': cleanNumber(balance)
            };
        } else if (currentTransaction && line && !line.match(/^\d{2}-\w{3}-\d{4}/)) {
            // Append to description
            currentTransaction['Keterangan'] += ' ' + line;
        }
    }

    if (currentTransaction) {
        transactions.push(currentTransaction);
    }

    return transactions;
}

// Muamalat Parser
function parseMuamalat(text) {
    const lines = text.split('\n');
    const transactions = [];
    let currentTransaction = null;

    const skipPatterns = [
        'MUAMALAT',
        'Account No',
        'Period',
        'Transaction Date',
        'Effective Date',
        'Reference Number',
        'Description',
        'Amount',
        'Balance',
        'Page'
    ];

    for (let line of lines) {
        line = line.trim();
        if (!line || skipPatterns.some(p => line.includes(p))) continue;

        // Match Muamalat pattern: refnum effectivedate transdate amount balance
        const match = line.match(/^([0-9A-Z]{10,})\s+(\d{2}-\w{3}-\d{4})\s+(\d{2}-\w{3}-\d{4})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/);
        
        if (match) {
            if (currentTransaction) {
                transactions.push(currentTransaction);
            }

            const [, refNum, effDate, trxDate, amount, balance] = match;
            const cleanAmount = cleanNumber(amount);
            const cleanBalance = cleanNumber(balance);

            // Determine if debit or credit based on balance change
            let isDebit = false;
            if (transactions.length > 0) {
                const prevBalance = transactions[transactions.length - 1]['Saldo'];
                isDebit = cleanBalance < prevBalance;
            }

            currentTransaction = {
                'Tanggal Transaksi': trxDate,
                'Tanggal Efektif': effDate,
                'Nomor Referensi': refNum,
                'Keterangan': '',
                'Debit': isDebit ? cleanAmount : '',
                'Kredit': !isDebit ? cleanAmount : '',
                'Saldo': cleanBalance
            };
        } else if (currentTransaction && line && !line.match(/^[0-9A-Z]{10,}/)) {
            // Append to description
            currentTransaction['Keterangan'] += ' ' + line;
        }
    }

    if (currentTransaction) {
        transactions.push(currentTransaction);
    }

    return transactions;
}

// Main conversion endpoint
router.post('/convert', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        const bank = req.body.bank || 'bca';
        console.log('[PDF-to-CSV] Converting PDF for bank:', bank);

        // Parse PDF
        const pdfData = await pdf(req.file.buffer);
        const text = pdfData.text;

        if (!text || text.length < 100) {
            return res.status(400).json({ error: 'PDF kosong atau tidak dapat dibaca' });
        }

        // Detect bank if not specified
        const detectedBank = detectBank(text);
        console.log('[PDF-to-CSV] Detected bank:', detectedBank);

        // Parse based on bank
        let transactions = [];
        let bankName = '';
        
        switch (bank.toLowerCase()) {
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
                return res.status(400).json({ error: 'Bank tidak didukung' });
        }

        if (transactions.length === 0) {
            return res.status(400).json({ error: 'Tidak ada transaksi ditemukan dalam PDF' });
        }

        console.log('[PDF-to-CSV] Found', transactions.length, 'transactions');

        // Convert to CSV
        const csv = parse(transactions);

        // Generate filename
        const date = new Date().toISOString().split('T')[0];
        const filename = `MUTASI_${bankName}_${date}.csv`;

        // Send CSV file
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('\uFEFF' + csv); // Add BOM for Excel UTF-8 support

    } catch (error) {
        console.error('[PDF-to-CSV] Error:', error);
        res.status(500).json({ 
            error: 'Gagal mengkonversi PDF',
            message: error.message 
        });
    }
});

// Health check
router.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'pdf-to-csv' });
});

module.exports = router;
