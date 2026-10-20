/**
 * ============================================================
 * Invoice File Status Tests
 * ============================================================
 * Menguji satu sumber kebenaran status file invoice:
 *   - count = jumlah TIPE file yang ada (kolom path ATAU invoice_files)
 *   - required = 3 untuk PPN, 2 untuk NON
 *
 * Ini yang menentukan badge status (0/3, 1/3, 2/3, 3/3) DAN
 * tombol download di dashboard. Keduanya harus selalu sinkron.
 * ============================================================
 */

const {
    computeFileStatus,
    normalizeKeterangan,
    requiredFileCount,
    PATH_COLUMN_BY_TYPE,
    FILE_TYPES
} = require('../invoice-file-status');

describe('Invoice File Status', () => {

    describe('normalizeKeterangan', () => {
        test('menormalisasi PPN dalam berbagai kapitalisasi', () => {
            expect(normalizeKeterangan('PPN')).toBe('PPN');
            expect(normalizeKeterangan('ppn')).toBe('PPN');
            expect(normalizeKeterangan('Ppn')).toBe('PPN');
            expect(normalizeKeterangan(' PPN ')).toBe('PPN');
        });

        test('menormalisasi NON dan legacy NON_PPN', () => {
            expect(normalizeKeterangan('NON')).toBe('NON');
            expect(normalizeKeterangan('non')).toBe('NON');
            expect(normalizeKeterangan('NON_PPN')).toBe('NON');
        });

        test('nilai kosong dianggap NON', () => {
            expect(normalizeKeterangan(null)).toBe('NON');
            expect(normalizeKeterangan(undefined)).toBe('NON');
            expect(normalizeKeterangan('')).toBe('NON');
        });
    });

    describe('requiredFileCount', () => {
        test('PPN butuh 3 file (invoice + bukti bayar + faktur pajak)', () => {
            expect(requiredFileCount('PPN')).toBe(3);
            expect(requiredFileCount('ppn')).toBe(3);
        });

        test('NON butuh 2 file (invoice + bukti bayar)', () => {
            expect(requiredFileCount('NON')).toBe(2);
            expect(requiredFileCount('NON_PPN')).toBe(2);
            expect(requiredFileCount(null)).toBe(2);
        });
    });

    describe('computeFileStatus', () => {
        const base = {
            invoice_pdf_path: null,
            bukti_bayar_path: null,
            faktur_pajak_path: null,
            keterangan: 'PPN'
        };

        test('0 file -> 0/3 (PPN)', () => {
            const status = computeFileStatus({ invoice: base, invoiceFileTypes: [] });
            expect(status.count).toBe(0);
            expect(status.required).toBe(3);
            expect(status.isComplete).toBe(false);
            expect(status.perType).toEqual({ invoice: false, bukti_bayar: false, faktur_pajak: false });
        });

        test('hanya kolom path terisi -> terhitung', () => {
            const status = computeFileStatus({
                invoice: { ...base, invoice_pdf_path: 'ARSIP/BEKASI/PPN/2026/AGUSTUS/15/1.pdf' },
                invoiceFileTypes: []
            });
            expect(status.count).toBe(1);
            expect(status.perType.invoice).toBe(true);
            expect(status.perType.bukti_bayar).toBe(false);
        });

        test('hanya record invoice_files -> terhitung', () => {
            const status = computeFileStatus({
                invoice: base,
                invoiceFileTypes: ['invoice']
            });
            expect(status.count).toBe(1);
            expect(status.perType.invoice).toBe(true);
        });

        test('path DAN invoice_files untuk tipe yang sama tidak dihitung dua kali', () => {
            const status = computeFileStatus({
                invoice: { ...base, invoice_pdf_path: 'x.pdf' },
                invoiceFileTypes: ['invoice']
            });
            expect(status.count).toBe(1);
        });

        test('3 file PPN -> 3/3 lengkap', () => {
            const status = computeFileStatus({
                invoice: {
                    ...base,
                    invoice_pdf_path: 'a.pdf',
                    bukti_bayar_path: 'b.pdf',
                    faktur_pajak_path: 'c.pdf'
                },
                invoiceFileTypes: ['invoice', 'bukti_bayar', 'faktur_pajak']
            });
            expect(status.count).toBe(3);
            expect(status.required).toBe(3);
            expect(status.isComplete).toBe(true);
        });

        test('2 file PPN -> 2/3 belum lengkap', () => {
            const status = computeFileStatus({
                invoice: { ...base, invoice_pdf_path: 'a.pdf', bukti_bayar_path: 'b.pdf' },
                invoiceFileTypes: ['invoice', 'bukti_bayar']
            });
            expect(status.count).toBe(2);
            expect(status.isComplete).toBe(false);
        });

        test('2 file NON -> 2/2 lengkap', () => {
            const status = computeFileStatus({
                invoice: {
                    ...base,
                    keterangan: 'NON',
                    invoice_pdf_path: 'a.pdf',
                    bukti_bayar_path: 'b.pdf'
                },
                invoiceFileTypes: ['invoice', 'bukti_bayar']
            });
            expect(status.count).toBe(2);
            expect(status.required).toBe(2);
            expect(status.isComplete).toBe(true);
        });

        test('file dihapus dari storage (path dikosongkan, record dihapus) -> count turun', () => {
            // Setelah delete: kolom path NULL dan record invoice_files hilang
            const status = computeFileStatus({
                invoice: { ...base, invoice_pdf_path: 'a.pdf' },
                invoiceFileTypes: []
            });
            expect(status.count).toBe(1);
            expect(status.perType.invoice).toBe(true);
        });

        test('path string kosong dianggap tidak ada', () => {
            const status = computeFileStatus({
                invoice: { ...base, invoice_pdf_path: '   ' },
                invoiceFileTypes: []
            });
            expect(status.count).toBe(0);
        });

        test('unknown file_type diabaikan', () => {
            const status = computeFileStatus({
                invoice: base,
                invoiceFileTypes: ['invoice', 'lainnya', null, undefined]
            });
            expect(status.count).toBe(1);
        });

        test('parameter kosong tidak error', () => {
            const status = computeFileStatus({});
            expect(status.count).toBe(0);
            expect(status.required).toBe(2);
        });
    });

    describe('PATH_COLUMN_BY_TYPE', () => {
        test('mapping kolom path benar', () => {
            expect(PATH_COLUMN_BY_TYPE.invoice).toBe('invoice_pdf_path');
            expect(PATH_COLUMN_BY_TYPE.bukti_bayar).toBe('bukti_bayar_path');
            expect(PATH_COLUMN_BY_TYPE.faktur_pajak).toBe('faktur_pajak_path');
        });

        test('3 tipe file yang dilacak', () => {
            expect(FILE_TYPES).toEqual(['invoice', 'bukti_bayar', 'faktur_pajak']);
        });
    });
});
