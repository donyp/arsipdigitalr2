/**
 * ============================================================
 * Excel Utils - SATU IMPLEMENTASI untuk browser & server
 * ============================================================
 * Dipakai oleh:
 *   - Browser: js/upload-excel.js, js/invoice-list.js  (window.ExcelUtils)
 *   - Server : backend/excel-parser.js, backend/invoice-endpoints.js (require)
 *   - Test   : backend/__tests__/excel-utils.test.js
 *
 * Kenapa satu file:
 *   Dulu ada 2 parser (browser vs server) dengan aturan berbeda sehingga
 *   bisa menghasilkan data berbeda untuk file yang sama - penyebab utama
 *   tanggal & nominal yang rusak.
 *
 * Modul ini UMD: bisa di-load via <script> (browser) DAN require() (Node).
 * ============================================================
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ExcelUtils = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MONTH_NAMES_ID = [
        'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
        'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
    ];

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function isValidYmd(y, m, d) {
        if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
        if (m < 1 || m > 12 || d < 1 || d > 31) return false;
        const dt = new Date(y, m - 1, d);
        // Tolak tanggal yang "meluber" (mis. 31 Februari)
        return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
    }

    /**
     * Normalisasi tanggal Excel -> 'YYYY-MM-DD'
     * Mengembalikan null kalau tidak bisa dipastikan.
     *
     * Menangani:
     *   - objek Date (dari XLSX cellDates:true)  -> komponen LOKAL
     *   - 'YYYY-MM-DD' (+ jam opsional)          -> langsung
     *   - 'DD-MM-YYYY' / 'DD/MM/YYYY'           -> hari dulu
     *   - 'D-M-YYYY' (tanpa nol)                 -> hari dulu
     *   - 'YYYY/MM/DD'                           -> tahun dulu
     *   - serial number Excel                    -> konversi
     *
     * PENTING: Date object HARUS dinormalisasi di browser (sebelum JSON),
     * karena begitu jadi string ISO, tanggal lokal aslinya hilang
     * (contoh: 15/08/2026 di WIB -> "2026-08-14T17:00:00.000Z").
     */
    function normalizeExcelDate(value) {
        if (value === null || value === undefined || value === '') return null;

        // 1. Objek Date (dipakai XLSX dengan cellDates:true)
        if (value instanceof Date) {
            if (isNaN(value.getTime())) return null;
            // Komponen LOKAL = tanggal yang dilihat user di Excel
            return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
        }

        // 2. Angka = serial number Excel
        if (typeof value === 'number' && isFinite(value)) {
            if (value < 1 || value > 2958465) return null; // di luar rentang Excel
            // Excel epoch 1900-01-01, dengan kquirk 2 hari
            const ms = Math.round((value - 25569) * 86400 * 1000);
            const d = new Date(ms);
            if (isNaN(d.getTime())) return null;
            return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
        }

        if (typeof value !== 'string') return null;

        const raw = value.trim();
        if (!raw) return null;

        // 3. ISO / YYYY-MM-DD (boleh ada jam)
        let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
        if (m) {
            const [, y, mo, d] = m;
            if (isValidYmd(parseInt(y, 10), parseInt(mo, 10), parseInt(d, 10))) {
                return `${y}-${mo}-${d}`;
            }
            return null;
        }

        // 4. YYYY/MM/DD
        m = raw.match(/^(\d{4})[\/](\d{1,2})[\/](\d{1,2})$/);
        if (m) {
            const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
            if (isValidYmd(y, mo, d)) return `${y}-${pad2(mo)}-${pad2(d)}`;
            return null;
        }

        // 5. DD-MM-YYYY / DD/MM/YYYY (hari dulu - format asli dari Excel)
        m = raw.match(/^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})$/);
        if (m) {
            const d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
            if (isValidYmd(y, mo, d)) return `${y}-${pad2(mo)}-${pad2(d)}`;
            return null;
        }

        return null;
    }

    /**
     * Parse nominal secara aman (mendukung format Indonesia).
     *   "1.234,56" -> 1234.56
     *   "1234.56"  -> 1234.56
     *   "1,234.56" -> 1234.56
     *   "Rp 1.500" -> 1500
     */
    function parseNominal(value) {
        if (value === null || value === undefined || value === '') return 0;
        if (typeof value === 'number') return isFinite(value) ? value : 0;

        let s = String(value).trim();
        if (!s) return 0;

        // Buang(simbol mata uang & spasi)
        s = s.replace(/[^\d.,\-]/g, '');
        if (!s) return 0;

        const lastComma = s.lastIndexOf(',');
        const lastDot = s.lastIndexOf('.');

        if (lastComma > -1 && lastDot > -1) {
            // Dua-duanya ada -> yang terakhir adalah pemisah desimal
            if (lastComma > lastDot) {
                s = s.replace(/\./g, '').replace(',', '.');
            } else {
                s = s.replace(/,/g, '');
            }
        } else if (lastComma > -1) {
            // Hanya koma: 3 digit di belakang = pemisah ribuan, selain itu desimal
            const decimals = s.length - lastComma - 1;
            s = decimals === 3 ? s.replace(/,/g, '') : s.replace(',', '.');
        } else if (lastDot > -1) {
            // Hanya titik: 3 digit di belakang = pemisah ribuan, selain itu desimal
            const decimals = s.length - lastDot - 1;
            const hasMultipleDots = (s.match(/\./g) || []).length > 1;
            s = (decimals === 3 || hasMultipleDots) ? s.replace(/\./g, '') : s.replace('.', '.');
        }

        const n = parseFloat(s);
        return isFinite(n) ? n : 0;
    }

    /**
     * Normalisasi nilai TOKO (lokasi ANKA).
     *   berisi 'PEMALANG' -> 'ANKA PEMALANG'
     *   berisi 'ANKA'     -> 'ANKA BEKASI'
     *   kosong             -> 'ANKA BEKASI'
     *   selain itu         -> nilai asli (mis. nama toko: 'Pasar Kemis')
     */
    function normalizeTokoValue(tokoRaw) {
        const raw = tokoRaw === null || tokoRaw === undefined ? '' : String(tokoRaw).trim();
        if (!raw) return 'ANKA BEKASI';

        const upper = raw.toUpperCase();
        if (upper.includes('PEMALANG')) return 'ANKA PEMALANG';
        if (upper.includes('ANKA')) return 'ANKA BEKASI';
        return raw;
    }

    /**
     * True bila baris adalah transaksi RETUR (dilewati saat import).
     */
    function isReturTransaction(jenisTransaksi) {
        const t = String(jenisTransaksi || 'jual').toLowerCase().trim();
        return t === 'retur' || t === 'return';
    }

    /**
     * Agregasi baris Excel per FAKTUR (1 invoice = 1 faktur, nominal dijumlahkan).
     * @param {Array} rows - baris hasil mapping kolom
     * @returns {{data: Array, skippedReturs: number, skippedNoFaktur: number}}
     */
    function aggregateByFaktur(rows) {
        const map = new Map();
        let skippedReturs = 0;
        let skippedNoFaktur = 0;

        (rows || []).forEach((row) => {
            const faktur = row.faktur === null || row.faktur === undefined
                ? ''
                : String(row.faktur).trim();

            if (!faktur) {
                skippedNoFaktur++;
                return;
            }

            if (isReturTransaction(row.jenis_transaksi)) {
                skippedReturs++;
                return;
            }

            const nominal = parseNominal(row.total_jumlah_jual);

            if (map.has(faktur)) {
                const existing = map.get(faktur);
                existing.total_jumlah_jual += nominal;
                existing.item_count = (existing.item_count || 1) + 1;
            } else {
                map.set(faktur, {
                    ...row,
                    faktur,
                    total_jumlah_jual: nominal,
                    item_count: 1
                });
            }
        });

        return {
            data: Array.from(map.values()),
            skippedReturs,
            skippedNoFaktur
        };
    }

    /**
     * Validasi 1 baris invoice.
     * @returns {{valid: boolean, reason: string|null}}
     */
    function validateInvoiceRow(row) {
        if (!row || !row.faktur || String(row.faktur).trim() === '') {
            return { valid: false, reason: 'Nomor faktur kosong' };
        }
        if (!/^\d+$/.test(String(row.faktur).trim())) {
            return { valid: false, reason: `Nomor faktur "${row.faktur}" bukan angka` };
        }
        if (!row.tanggal) {
            return { valid: false, reason: 'Tanggal kosong' };
        }
        if (!row.toko || String(row.toko).trim() === '') {
            return { valid: false, reason: 'Nama toko kosong' };
        }
        return { valid: true, reason: null };
    }

    return {
        MONTH_NAMES_ID,
        normalizeExcelDate,
        parseNominal,
        normalizeTokoValue,
        isReturTransaction,
        aggregateByFaktur,
        validateInvoiceRow
    };
}));
