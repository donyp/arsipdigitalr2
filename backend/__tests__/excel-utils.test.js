/**
 * ============================================================
 * Test Excel Utils (sumber tunggal untuk browser & server)
 * ============================================================
 */

const ExcelUtils = require('../../js/excel-utils.js');

describe('Excel Utils', () => {

    describe('normalizeExcelDate', () => {
        test('objek Date -> YYYY-MM-DD (komponen lokal)', () => {
            const d = new Date(2026, 7, 15); // 15 Agustus 2026 (lokal)
            expect(ExcelUtils.normalizeExcelDate(d)).toBe('2026-08-15');
        });

        test('tanggal ISO dari JSON (hasil Date -> string)', () => {
            // Nilai lokal 15/08/2026 di WIB menjadi "2026-08-14T17:00:00.000Z"
            // Karena itu normalisasi WAJIB di browser sebelum dikirim.
            const iso = new Date(2026, 7, 15).toISOString();
            expect(typeof iso).toBe('string');
            // Di server, string ISO dibaca sebagai bagian tanggalnya
            expect(ExcelUtils.normalizeExcelDate(iso)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });

        test('teks DD-MM-YYYY', () => {
            expect(ExcelUtils.normalizeExcelDate('15-08-2026')).toBe('2026-08-15');
            expect(ExcelUtils.normalizeExcelDate('1-8-2026')).toBe('2026-08-01');
        });

        test('teks DD/MM/YYYY', () => {
            expect(ExcelUtils.normalizeExcelDate('15/08/2026')).toBe('2026-08-15');
        });

        test('teks YYYY-MM-DD', () => {
            expect(ExcelUtils.normalizeExcelDate('2026-08-15')).toBe('2026-08-15');
            expect(ExcelUtils.normalizeExcelDate('2026-08-15 10:30:00')).toBe('2026-08-15');
        });

        test('tanggal tidak valid -> null (bukan diam-diam jadi hari ini)', () => {
            expect(ExcelUtils.normalizeExcelDate('31/02/2026')).toBeNull();
            expect(ExcelUtils.normalizeExcelDate('abc')).toBeNull();
            expect(ExcelUtils.normalizeExcelDate('')).toBeNull();
            expect(ExcelUtils.normalizeExcelDate(null)).toBeNull();
            expect(ExcelUtils.normalizeExcelDate(undefined)).toBeNull();
            expect(ExcelUtils.normalizeExcelDate(new Date('invalid'))).toBeNull();
        });

        test('serial number Excel', () => {
            // 46239 = 15 Agustus 2026 (approximate check via serial terbalik)
            const s = ExcelUtils.normalizeExcelDate(46239);
            expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });
    });

    describe('parseNominal', () => {
        test('angka langsung', () => {
            expect(ExcelUtils.parseNominal(1500.5)).toBe(1500.5);
        });

        test('format Indonesia "1.234,56"', () => {
            expect(ExcelUtils.parseNominal('1.234,56')).toBe(1234.56);
        });

        test('format Indonesia "1.500"', () => {
            expect(ExcelUtils.parseNominal('1.500')).toBe(1500);
        });

        test('format Inggris "1,234.56"', () => {
            expect(ExcelUtils.parseNominal('1,234.56')).toBe(1234.56);
        });

        test('dengan simbol mata uang', () => {
            expect(ExcelUtils.parseNominal('Rp 1.500.000')).toBe(1500000);
        });

        test('nilai tidak valid -> 0', () => {
            expect(ExcelUtils.parseNominal('')).toBe(0);
            expect(ExcelUtils.parseNominal(null)).toBe(0);
            expect(ExcelUtils.parseNominal('abc')).toBe(0);
        });
    });

    describe('normalizeTokoValue', () => {
        test('PEMALANG -> ANKA PEMALANG', () => {
            expect(ExcelUtils.normalizeTokoValue('TOKO ANKA PEMALANG')).toBe('ANKA PEMALANG');
        });

        test('ANKA -> ANKA BEKASI', () => {
            expect(ExcelUtils.normalizeTokoValue('TOKO ANKA BEKASI')).toBe('ANKA BEKASI');
        });

        test('kosong -> ANKA BEKASI', () => {
            expect(ExcelUtils.normalizeTokoValue('')).toBe('ANKA BEKASI');
            expect(ExcelUtils.normalizeTokoValue(null)).toBe('ANKA BEKASI');
        });

        test('nama toko asli dipertahankan', () => {
            expect(ExcelUtils.normalizeTokoValue('Pasar Kemis')).toBe('Pasar Kemis');
        });
    });

    describe('isReturTransaction', () => {
        test('mendeteksi retur', () => {
            expect(ExcelUtils.isReturTransaction('RETUR')).toBe(true);
            expect(ExcelUtils.isReturTransaction('return')).toBe(true);
        });

        test('bukan retur', () => {
            expect(ExcelUtils.isReturTransaction('jual')).toBe(false);
            expect(ExcelUtils.isReturTransaction('')).toBe(false);
            expect(ExcelUtils.isReturTransaction(undefined)).toBe(false);
        });
    });

    describe('aggregateByFaktur', () => {
        test('menjumlahkan nominal per faktur', () => {
            const result = ExcelUtils.aggregateByFaktur([
                { faktur: 'A1', total_jumlah_jual: 100, jenis_transaksi: 'jual' },
                { faktur: 'A1', total_jumlah_jual: 50, jenis_transaksi: 'jual' },
                { faktur: 'A2', total_jumlah_jual: 10, jenis_transaksi: 'jual' }
            ]);
            expect(result.data.length).toBe(2);
            expect(result.data.find(r => r.faktur === 'A1').total_jumlah_jual).toBe(150);
            expect(result.data.find(r => r.faktur === 'A1').item_count).toBe(2);
        });

        test('retur dilewati & dihitung', () => {
            const result = ExcelUtils.aggregateByFaktur([
                { faktur: 'A1', total_jumlah_jual: 100, jenis_transaksi: 'jual' },
                { faktur: 'A2', total_jumlah_jual: 70, jenis_transaksi: 'RETUR' }
            ]);
            expect(result.data.length).toBe(1);
            expect(result.skippedReturs).toBe(1);
        });

        test('baris tanpa faktur dilewati', () => {
            const result = ExcelUtils.aggregateByFaktur([
                { faktur: '', total_jumlah_jual: 100, jenis_transaksi: 'jual' },
                { faktur: 'A1', total_jumlah_jual: 10, jenis_transaksi: 'jual' }
            ]);
            expect(result.data.length).toBe(1);
            expect(result.skippedNoFaktur).toBe(1);
        });
    });

    describe('validateInvoiceRow', () => {
        const base = { faktur: '835100310', tanggal: '2026-08-15', toko: 'Pasar Kemis' };

        test('baris valid', () => {
            expect(ExcelUtils.validateInvoiceRow(base).valid).toBe(true);
        });

        test('faktur kosong', () => {
            expect(ExcelUtils.validateInvoiceRow({ ...base, faktur: '' }).valid).toBe(false);
        });

        test('faktur bukan angka', () => {
            expect(ExcelUtils.validateInvoiceRow({ ...base, faktur: 'ABC' }).valid).toBe(false);
        });

        test('tanggal kosong', () => {
            expect(ExcelUtils.validateInvoiceRow({ ...base, tanggal: '' }).valid).toBe(false);
        });

        test('toko kosong', () => {
            expect(ExcelUtils.validateInvoiceRow({ ...base, toko: '' }).valid).toBe(false);
        });
    });
});
