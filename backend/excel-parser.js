// ============================================================
// Excel Parser for REKAP_LABA.xls
// Parse and aggregate invoice data by faktur number
// ============================================================

const XLSX = require('xlsx');

/**
 * Normalize toko name based on business rules:
 * - "ANKA" or contains "ANKA" but NOT "PEMALANG" â†’ "ANKA BEKASI"
 * - Contains "ANKA PEMALANG" â†’ "ANKA PEMALANG"
 */
function normalizeToko(tokoRaw) {
    // Handle empty/null values - default to ANKA BEKASI
    if (!tokoRaw || String(tokoRaw).trim() === '') {
        console.warn('[Excel Parser] Empty toko value detected, defaulting to ANKA BEKASI');
        return 'ANKA BEKASI';
    }
    
    const tokoUpper = String(tokoRaw).toUpperCase().trim();
    
    // Check for ANKA PEMALANG first (more specific)
    if (tokoUpper.includes('PEMALANG')) {
        return 'ANKA PEMALANG';
    }
    
    // Check for ANKA (default to BEKASI)
    if (tokoUpper.includes('ANKA')) {
        return 'ANKA BEKASI';
    }
    
    // If not ANKA-related, keep original but trimmed
    // This allows for future expansion to other stores
    return String(tokoRaw).trim();
}

/**
 * Parse Excel date to JavaScript Date
 */
function parseExcelDate(excelDate) {
    if (!excelDate) return null;
    
    // If already a Date object
    if (excelDate instanceof Date) {
        return excelDate;
    }
    
    // If string format DD-MM-YYYY or DD/MM/YYYY
    if (typeof excelDate === 'string') {
        const parts = excelDate.split(/[-\/]/);
        if (parts.length === 3) {
            // Assuming DD-MM-YYYY format
            const day = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1; // JS months are 0-indexed
            const year = parseInt(parts[2]);
            return new Date(year, month, day);
        }
    }
    
    // If Excel serial number
    if (typeof excelDate === 'number') {
        // Excel serial date starts from 1900-01-01
        const excelEpoch = new Date(1900, 0, 1);
        const days = excelDate - 2; // Excel has a bug, off by 2
        return new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
    }
    
    return null;
}

/**
 * Format date to DD/MM/YYYY
 */
function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

/**
 * Parse and aggregate Excel data
 * 
 * Returns:
 * {
 *   success: true,
 *   data: [...], // Aggregated invoice data
 *   summary: {
 *     totalRows: number,
 *     uniqueFakturs: number,
 *     aggregatedCount: number
 *   }
 * }
 */
function parseExcel(fileBuffer) {
    console.log('[Excel Parser] parseExcel() called');
    console.log('[Excel Parser] Buffer info:', {
        type: typeof fileBuffer,
        isBuffer: Buffer.isBuffer(fileBuffer),
        length: fileBuffer ? fileBuffer.length : 0
    });
    
    try {
        console.log('[Excel Parser] Starting XLSX.read()...');
        // Read workbook from buffer
        // Read workbook with options for legacy .xls format support
        const workbook = XLSX.read(fileBuffer, { 
            type: 'buffer',
            cellDates: true,  // Parse dates as Date objects
            cellNF: false,    // Don't include number format
            cellText: false   // Don't include formatted text
        });
        
        console.log(`[Excel Parser] Workbook loaded: ${workbook.SheetNames.length} sheets`);
        console.log(`[Excel Parser] Sheet names: ${workbook.SheetNames.join(', ')}`);
        
        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON with header detection
        console.log(`[Excel Parser] Processing sheet: ${sheetName}`);
        const rawData = XLSX.utils.sheet_to_json(worksheet, {
            defval: null,     // Default value for empty cells
            blankrows: false  // Skip blank rows
        });
        
        console.log(`[Excel Parser] Parsed ${rawData.length} rows from sheet`);
        if (rawData.length > 0) {
            console.log(`[Excel Parser] First row keys:`, Object.keys(rawData[0]));
            console.log(`[Excel Parser] First row sample:`, rawData[0]);
        }
        
        if (!rawData || rawData.length === 0) {
            return {
                success: false,
                error: 'Excel file is empty or invalid'
            };
        }
        
        console.log(`[Excel Parser] Total rows: ${rawData.length}`);
        
        // Group by FAKTUR and aggregate
        const faktursMap = new Map();
        let skippedRetur = 0;
        
        rawData.forEach((row, index) => {
            try {
                // Extract fields (column names might vary)
                const tanggal = row['TANGGAL'] || row['tanggal'];
                const tokoRaw = row['TOKO'] || row['toko'];
                const faktur = row['FAKTUR'] || row['faktur'];
                const metodeBayar = row['METODE BAYAR'] || row['metode_bayar'] || row['metode bayar'];
                const jenisTransaksi = row['JENIS TRANSAKSI'] || row['jenis_transaksi'] || row['jenis transaksi'];
                const konsumen = row['KONSUMEN'] || row['konsumen'];
                const jumlahJual = parseFloat(row['JUMLAH JUAL'] || row['jumlah_jual'] || row['jumlah jual'] || 0);
                const keterangan = row['KET 2'] || row['ket_2'] || row['ket 2'] || row['KETERANGAN'] || row['keterangan'];
                
                // Skip if no faktur
                if (!faktur) {
                    console.warn(`[Excel Parser] Row ${index + 1}: Missing faktur, skipping`);
                    return;
                }
                
                // FILTER: Only accept 'jual' transactions, skip 'retur'
                const transactionType = String(jenisTransaksi || 'jual').toLowerCase().trim();
                if (transactionType === 'retur' || transactionType === 'return') {
                    console.warn(`[Excel Parser] Row ${index + 1}: Skipping RETUR transaction (faktur: ${faktur})`);
                    skippedRetur++;
                    return;
                }
                
                // Parse tanggal
                const parsedDate = parseExcelDate(tanggal);
                if (!parsedDate) {
                    console.warn(`[Excel Parser] Row ${index + 1}: Invalid date, skipping`);
                    return;
                }
                
                // Normalize toko
                const tokoNormalized = normalizeToko(tokoRaw);
                console.log(`[Excel Parser] Row ${index + 1}: tokoRaw="${tokoRaw}" -> tokoNormalized="${tokoNormalized}"`);
                
                // If faktur already exists, aggregate
                if (faktursMap.has(faktur)) {
                    const existing = faktursMap.get(faktur);
                    existing.total_jumlah_jual += jumlahJual;
                    existing.item_count += 1;
                } else {
                    // Create new entry
                    faktursMap.set(faktur, {
                        tanggal: parsedDate,
                        tanggal_formatted: formatDate(parsedDate),
                        toko: tokoNormalized,
                        toko_raw: tokoRaw,
                        faktur: String(faktur).trim(),
                        metode_bayar: metodeBayar || 'Unknown',
                        jenis_transaksi: jenisTransaksi || 'jual',
                        konsumen: konsumen || 'Unknown',
                        keterangan: keterangan || 'NON PPN',
                        total_jumlah_jual: jumlahJual,
                        item_count: 1
                    });
                }
            } catch (err) {
                console.error(`[Excel Parser] Error parsing row ${index + 1}:`, err.message);
            }
        });
        
        // Convert map to array
        const aggregatedData = Array.from(faktursMap.values());
        
        console.log(`[Excel Parser] Aggregated ${rawData.length} rows into ${aggregatedData.length} unique fakturs (skipped ${skippedRetur} retur transactions)`);
        
        return {
            success: true,
            data: aggregatedData,
            summary: {
                totalRows: rawData.length,
                uniqueFakturs: aggregatedData.length,
                aggregatedCount: rawData.length - aggregatedData.length,
                skippedReturs: skippedRetur
            }
        };
        
    } catch (error) {
        console.error('[Excel Parser] Error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Validate parsed data with comprehensive checks
 */
function validateData(data) {
    const errors = [];
    const warnings = [];
    const seenFakturs = new Set();
    
    // Check if data is empty
    if (!data || data.length === 0) {
        errors.push('Excel file is empty (no data rows)');
        return {
            isValid: false,
            errors,
            warnings
        };
    }
    
    data.forEach((item, index) => {
        const rowNum = index + 1;
        
        // Check required fields
        if (!item.faktur || String(item.faktur).trim() === '') {
            errors.push(`Row ${rowNum}: Nomor faktur kosong`);
        } else {
            // Check for duplicate fakturs
            if (seenFakturs.has(String(item.faktur).trim())) {
                errors.push(`Row ${rowNum}: Nomor faktur "${item.faktur}" sudah terdapat di data (duplikat)`);
            } else {
                seenFakturs.add(String(item.faktur).trim());
            }
            
            // Validate faktur format (should be numeric)
            if (!/^\d+$/.test(String(item.faktur).trim())) {
                warnings.push(`Row ${rowNum}: Nomor faktur "${item.faktur}" bukan angka murni`);
            }
        }
        
        if (!item.tanggal) {
            errors.push(`Row ${rowNum}: Tanggal kosong`);
        }
        
        if (!item.toko || String(item.toko).trim() === '') {
            errors.push(`Row ${rowNum}: Nama toko kosong`);
        }
        
        if (item.total_jumlah_jual === null || item.total_jumlah_jual === undefined) {
            errors.push(`Row ${rowNum}: Jumlah jual kosong`);
        } else if (typeof item.total_jumlah_jual !== 'number') {
            errors.push(`Row ${rowNum}: Jumlah jual harus angka (saat ini: ${typeof item.total_jumlah_jual})`);
        }
        
        // Validate keterangan (PPN/NON PPN - REQUIRED for folder grouping)
        if (!item.keterangan || String(item.keterangan).trim() === '') {
            errors.push(`Row ${rowNum}: Keterangan (PPN/NON PPN) kosong`);
        } else {
            const validKeterangan = ['PPN', 'NON PPN', 'NON'];
            if (!validKeterangan.some(k => String(item.keterangan).toUpperCase().includes(k))) {
                errors.push(`Row ${rowNum}: Keterangan "${item.keterangan}" harus PPN atau NON PPN`);
            }
        }
        
        // Validate metode bayar (optional)
        if (item.metode_bayar) {
            const validMetode = ['Piutang', 'Bank', 'Cash', 'PIUTANG', 'BANK', 'CASH'];
            if (!validMetode.includes(item.metode_bayar)) {
                warnings.push(`Row ${rowNum}: Metode bayar "${item.metode_bayar}" mungkin tidak sesuai standar`);
            }
        }
    });
    
    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        totalRows: data.length,
        uniqueFakturs: seenFakturs.size
    };
}

module.exports = {
    parseExcel,
    validateData,
    normalizeToko,
    parseExcelDate,
    formatDate
};
