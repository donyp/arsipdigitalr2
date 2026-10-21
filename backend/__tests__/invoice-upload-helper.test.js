/**
 * ============================================================
 * Unit Test: Invoice Upload Helper
 * ============================================================
 * Menguji logika baru upload invoice:
 *   - buildTargetPath     : path R2 harus konsisten dengan saat upload
 *   - checkDuplicateState  : aturan duplikat seragam 3 tipe
 *   - persistInvoiceFile  : TIDAK PERNAH menulis NULL ke kolom path
 *   - syncInvoiceFileCount: count dari sumber tunggal
 *   - isPdfBuffer         : validasi magic bytes
 * ============================================================
 */

const path = require('path');
const helper = require('../invoice-upload-helper.js');
const { isPdfBuffer } = require('../invoice-upload-helper.js');

// Mock require untuk invoice-upload-helper -> butuh path yang benar
describe('Invoice Upload Helper', () => {

    describe('buildTargetPath', () => {
        const invoice = { tanggal: '2026-08-15', keterangan: 'PPN', toko: 'TOKO ANKA PEMALANG' };

        test('invoice PPN -> path PPN', () => {
            const r = helper.buildTargetPath('invoice', { invoice, filename: '835100310.pdf', location: 'PEMALANG' });
            expect(r.storagePath).toBe('ARSIP/PEMALANG/PPN/2026/AGUSTUS/15/835100310.pdf');
            expect(r.category).toBe('PPN');
        });

        test('invoice NON -> path NON', () => {
            const r = helper.buildTargetPath('invoice', {
                invoice: { ...invoice, keterangan: 'NON' },
                filename: '1.pdf', location: 'BEKASI'
            });
            expect(r.storagePath).toBe('ARSIP/BEKASI/NON/2026/AGUSTUS/15/1.pdf');
        });

        test('bukti bayar -> folder bukti-bayar (bukan BUKTIBAYAR)', () => {
            const r = helper.buildTargetPath('bukti_bayar', { invoice, filename: '835100310.pdf', location: 'BEKASI' });
            expect(r.storagePath).toBe('ARSIP/BEKASI/bukti-bayar/2026/AGUSTUS/15/835100310.pdf');
        });

        test('faktur pajak -> folder Faktur-Pajak (bukan FAKTURPAJAK)', () => {
            const r = helper.buildTargetPath('faktur_pajak', { invoice, filename: 'tax-835.pdf', location: 'BEKASI' });
            expect(r.storagePath).toBe('ARSIP/BEKASI/Faktur-Pajak/2026/AGUSTUS/15/tax-835.pdf');
        });

        test('tanpa tanggal invoice -> pakai hari ini', () => {
            const r = helper.buildTargetPath('bukti_bayar', { invoice: null, filename: '9.pdf', location: 'BEKASI' });
            expect(r.storagePath).toMatch(/^ARSIP\/BEKASI\/bukti-bayar\/\d{4}\/\w+\/\d{2}\/9\.pdf$/);
        });
    });

    describe('checkDuplicateState', () => {
        const R2 = {
            existing: new Set(),
            checkFileExistsNoCache: async (p) => R2.existing.has(p)
        };

        beforeEach(() => { R2.existing = new Set(); });

        test('file masih ada -> reject (409)', async () => {
            R2.existing = new Set(['a.pdf']);
            const r = await helper.checkDuplicateState({
                type: 'invoice',
                invoice: { invoice_pdf_path: 'a.pdf' },
                targetPath: 'a.pdf',
                R2Storage: R2
            });
            expect(r.action).toBe('reject');
            expect(r.existingPath).toBe('a.pdf');
        });

        test('path tercatat tapi file hilang -> allow (stale record)', async () => {
            const r = await helper.checkDuplicateState({
                type: 'invoice',
                invoice: { invoice_pdf_path: 'a.pdf' },
                targetPath: 'a.pdf',
                R2Storage: R2
            });
            expect(r.action).toBe('allow');
            expect(r.reason).toBe('stale_record');
        });

        test('tanpa path tapi file ada di storage -> adopt', async () => {
            R2.existing = new Set(['b.pdf']);
            const r = await helper.checkDuplicateState({
                type: 'invoice',
                invoice: {},
                targetPath: 'b.pdf',
                R2Storage: R2
            });
            expect(r.action).toBe('adopt');
        });

        test('file baru -> allow', async () => {
            const r = await helper.checkDuplicateState({
                type: 'invoice', invoice: {}, targetPath: 'c.pdf', R2Storage: R2
            });
            expect(r.action).toBe('allow');
            expect(r.reason).toBe('new_file');
        });

        test('overwrite -> allow walau file ada', async () => {
            R2.existing = new Set(['d.pdf']);
            const r = await helper.checkDuplicateState({
                type: 'invoice',
                invoice: { invoice_pdf_path: 'd.pdf' },
                targetPath: 'd.pdf',
                overwrite: true,
                R2Storage: R2
            });
            expect(r.action).toBe('allow');
        });

        test('gagal cek R2 -> tidak menolak (lenient)', async () => {
            const R2Err = { checkFileExistsNoCache: async () => { throw new Error('network'); } };
            const r = await helper.checkDuplicateState({
                type: 'invoice', invoice: { invoice_pdf_path: 'x.pdf' }, targetPath: 'y.pdf', R2Storage: R2Err
            });
            expect(r.action).toBe('allow');
        });
    });

    describe('isPdfBuffer', () => {
        test('PDF asli diterima', () => {
            expect(isPdfBuffer(Buffer.from('%PDF-1.7\ndata'))).toBe(true);
        });
        test('PNG ditolak', () => {
            expect(isPdfBuffer(Buffer.from('\x89PNG\r\n\x1a\n'))).toBe(false);
        });
        test('file kosong / pendek ditolak', () => {
            expect(isPdfBuffer(Buffer.alloc(0))).toBe(false);
            expect(isPdfBuffer(Buffer.from('ab'))).toBe(false);
        });
    });

    describe('persistInvoiceFile', () => {
        let originalFetch;
        let fetchCalls;

        beforeEach(() => {
            originalFetch = global.fetch;
            fetchCalls = [];
            global.fetch = jest.fn(async (url, opts) => {
                fetchCalls.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null });
                return { ok: true, status: 200, text: async () => '' };
            });
        });

        afterEach(() => { global.fetch = originalFetch; });

        test('menulis invoice_files + kolom path, TIDAK pernah null', async () => {
            const res = await helper.persistInvoiceFile({
                supabase: {}, faktur: 'F1', type: 'invoice',
                filePath: 'ARSIP/BEKASI/PPN/2026/AGUSTUS/15/F1.pdf', userId: 'u1'
            });

            expect(res.ok).toBe(true);
            expect(res.invoiceFilesOk).toBe(true);
            expect(res.pathOk).toBe(true);

            // 2 request: upsert invoice_files + PATCH kolom path
            expect(fetchCalls.length).toBe(2);
            expect(fetchCalls[0].url).toContain('/rest/v1/invoice_files');
            expect(fetchCalls[0].body.file_type).toBe('invoice');
            expect(fetchCalls[0].body.file_path).toBe('ARSIP/BEKASI/PPN/2026/AGUSTUS/15/F1.pdf');
            expect(fetchCalls[1].url).toContain('invoice_file_list?faktur=eq.F1');
            expect(fetchCalls[1].body.invoice_pdf_path).toBe('ARSIP/BEKASI/PPN/2026/AGUSTUS/15/F1.pdf');
        });

        test('kegagalan patch path dilaporkan (tidak ditDiamkan)', async () => {
            global.fetch = jest.fn(async (url) => {
                if (String(url).includes('invoice_file_list')) {
                    return { ok: false, status: 400, text: async () => 'bad' };
                }
                return { ok: true, status: 200, text: async () => '' };
            });

            const res = await helper.persistInvoiceFile({
                supabase: {}, faktur: 'F2', type: 'bukti_bayar', filePath: 'p.pdf', userId: 'u1'
            });

            expect(res.ok).toBe(false);
            expect(res.pathOk).toBe(false);
            expect(res.error).toBeTruthy();
        });

        test('tidak menulis kolom path kalau filePath kosong', async () => {
            const res = await helper.persistInvoiceFile({
                supabase: {}, faktur: 'F3', type: 'invoice', filePath: null, userId: 'u1'
            });
            // hanya 1 request (invoice_files), tidak ada PATCH path
            expect(fetchCalls.length).toBe(1);
            expect(res.pathOk).toBe(false);
        });
    });
});
