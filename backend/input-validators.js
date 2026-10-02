/**
 * input-validators.js
 * Centralized input validation middleware dan helper functions
 * untuk mencegah injection, path traversal, dan invalid data
 */

// ============================================================
// SANITIZE: Hapus karakter berbahaya dari string biasa
// ============================================================
function sanitizeString(value, maxLength = 500) {
    if (value === null || value === undefined) return null;
    return String(value)
        .trim()
        .substring(0, maxLength)
        // Hapus null bytes
        .replace(/\0/g, '')
        // Hapus karakter kontrol (kecuali tab/newline yang valid)
        .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

// ============================================================
// VALIDATE: zona_id harus integer positif
// ============================================================
function validateZonaId(value) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed <= 0 || parsed > 9999) return null;
    return parsed;
}

// ============================================================
// VALIDATE: tanggal harus format YYYY-MM-DD
// ============================================================
function validateDate(value) {
    if (!value) return null;
    const str = String(value).trim();
    // Format: YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
    const d = new Date(str);
    if (isNaN(d.getTime())) return null;
    // Pastikan tahun masuk akal (antara 2000-2100)
    const year = d.getFullYear();
    if (year < 2000 || year > 2100) return null;
    return str;
}

// ============================================================
// VALIDATE: category harus dari whitelist
// ============================================================
const VALID_CATEGORIES = [
    'invoice', 'bukti_bayar', 'faktur_pajak', 'piutang',
    'excel', 'document', 'default', 'media', 'image',
    'video', 'design', 'other'
];

function validateCategory(value) {
    if (!value) return null;
    const str = String(value).trim().toLowerCase();
    if (!VALID_CATEGORIES.includes(str)) return null;
    return str;
}

// ============================================================
// VALIDATE: faktur nomor (alphanumeric + dash/slash)
// ============================================================
function validateFaktur(value) {
    if (!value) return null;
    const str = String(value).trim();
    // Faktur: angka, huruf, -, /, ., spasi — max 100 karakter
    if (!/^[\w\s\-\/\.]{1,100}$/.test(str)) return null;
    return str;
}

// ============================================================
// VALIDATE: pagination params
// ============================================================
function validatePagination(limitRaw, offsetRaw) {
    const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 100, 1), 500);
    const offset = Math.max(parseInt(offsetRaw, 10) || 0, 0);
    return { limit, offset };
}

// ============================================================
// VALIDATE: ID (UUID atau integer)
// ============================================================
function validateId(value) {
    if (!value) return null;
    const str = String(value).trim();
    // UUID format
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) return str;
    // Integer ID
    const parsed = parseInt(str, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
    return null;
}

// ============================================================
// SANITIZE: Filename — cegah path traversal
// ============================================================
function sanitizeFilename(filename) {
    if (!filename) return 'upload';
    return String(filename)
        // Hapus path separators (path traversal prevention)
        .replace(/[\/\\]/g, '_')
        // Hapus null bytes dan karakter berbahaya
        .replace(/[\x00-\x1f\x7f<>:"|?*]/g, '_')
        // Hapus relative path attempts
        .replace(/\.\./g, '__')
        // Trim dan limit panjang
        .trim()
        .substring(0, 255)
        // Pastikan tidak kosong setelah sanitasi
        || 'upload';
}

// ============================================================
// MIDDLEWARE: Validasi request body untuk invoice list
// ============================================================
function validateInvoiceListQuery(req, res, next) {
    // Sanitasi semua query params
    if (req.query.zona_id) {
        const zonaId = validateZonaId(req.query.zona_id);
        if (zonaId === null) {
            return res.status(400).json({ error: 'zona_id tidak valid. Harus berupa angka positif.' });
        }
        req.query.zona_id = zonaId;
    }

    if (req.query.date_from) {
        const date = validateDate(req.query.date_from);
        if (date === null) {
            return res.status(400).json({ error: 'date_from tidak valid. Format: YYYY-MM-DD.' });
        }
        req.query.date_from = date;
    }

    if (req.query.date_to) {
        const date = validateDate(req.query.date_to);
        if (date === null) {
            return res.status(400).json({ error: 'date_to tidak valid. Format: YYYY-MM-DD.' });
        }
        req.query.date_to = date;
    }

    if (req.query.status) {
        req.query.status = sanitizeString(req.query.status, 50);
    }

    if (req.query.toko) {
        req.query.toko = sanitizeString(req.query.toko, 200);
    }

    if (req.query.search) {
        req.query.search = sanitizeString(req.query.search, 200);
    }

    const { limit, offset } = validatePagination(req.query.limit, req.query.offset);
    req.query.limit = limit;
    req.query.offset = offset;

    next();
}

// ============================================================
// MIDDLEWARE: Validasi upload body
// ============================================================
function validateUploadBody(req, res, next) {
    if (req.body.zona_id !== undefined) {
        const zonaId = validateZonaId(req.body.zona_id);
        if (zonaId === null) {
            return res.status(400).json({ error: 'zona_id tidak valid.' });
        }
        req.body.zona_id = zonaId;
    }

    if (req.body.category !== undefined) {
        const cat = validateCategory(req.body.category);
        if (cat === null) {
            return res.status(400).json({ error: `category tidak valid. Pilihan: ${VALID_CATEGORIES.join(', ')}` });
        }
        req.body.category = cat;
    }

    if (req.body.tanggal !== undefined) {
        const date = validateDate(req.body.tanggal);
        if (date === null) {
            return res.status(400).json({ error: 'tanggal tidak valid. Format: YYYY-MM-DD.' });
        }
        req.body.tanggal = date;
    }

    // Sanitasi field teks bebas
    ['keterangan', 'konsumen', 'toko', 'notes'].forEach(field => {
        if (req.body[field] !== undefined) {
            req.body[field] = sanitizeString(req.body[field], 1000);
        }
    });

    next();
}

module.exports = {
    sanitizeString,
    validateZonaId,
    validateDate,
    validateCategory,
    validateFaktur,
    validatePagination,
    validateId,
    sanitizeFilename,
    validateInvoiceListQuery,
    validateUploadBody,
    VALID_CATEGORIES
};
