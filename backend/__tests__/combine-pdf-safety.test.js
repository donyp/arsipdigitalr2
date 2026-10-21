/**
 * ============================================================
 * Unit Test: Endpoint combine-pdf aman (Fase 3)
 * ============================================================
 * Verifikasi: combine TIDAK boleh diam-diam menghasilkan PDF yang hanya
 * berisi sebagian file. Kalau ada file wajib yang hilang -> 400 + pesan
 * jelas ke user.
 * ============================================================
 */

jest.mock('../r2-storage', () => ({
    downloadFile: jest.fn(async () => Buffer.from('%PDF-1.4 fake')),
    downloadFileStream: jest.fn(),
    checkFileExistsNoCache: async () => false,
    invalidateFileExistenceCache: () => {},
    getConfig: () => ({ bucketName: 'test' }),
    getS3Client: () => ({}),
    listFiles: async () => [],
    deleteFile: async () => {},
    buildInvoicePath: () => 'x.pdf',
    buildDocumentPath: () => 'x.pdf',
    monthNameVariants: (m) => [String(m)]
}));

const { registerInvoiceEndpoints } = require('../invoice-endpoints.js');

function makeQuery(resolver) {
    const args = { in: null, eq: null, eq2: null, like: null };
    const q = {
        _args: args,
        select: () => q,
        in: (col, vals) => { args.in = { col, vals }; return q; },
        eq: (col, val) => {
            if (!args.eq) args.eq = { col, val };
            else args.eq2 = { col, val };
            return q;
        },
        like: (col, val) => { args.like = { col, val }; return q; },
        limit: () => q, order: () => q, range: () => q,
        maybeSingle: () => q, single: () => q,
        then: (resolve, reject) =>
            Promise.resolve(typeof resolver === 'function' ? resolver(args) : resolver).then(resolve, reject)
    };
    return q;
}

function createMockSupabase(routes = {}) {
    return {
        from(table) {
            return {
                select() {
                    const key = `${table}.select`;
                    return makeQuery(routes[key] || (() => ({ data: [], error: null })));
                },
                insert() { return makeQuery(() => ({ data: null, error: null })); },
                update() { return makeQuery(() => ({ data: null, error: null })); },
                delete() { return makeQuery(() => ({ data: null, error: null })); }
            };
        }
    };
}

function createFakeApp() {
    const routes = {};
    const record = (method) => (p, ...handlers) => { routes[`${method} ${p}`] = handlers[handlers.length - 1]; };
    return {
        routes,
        get: record('GET'), post: record('POST'), put: record('PUT'),
        patch: record('PATCH'), delete: record('DELETE'), use: () => {}
    };
}

function createRes() {
    let statusCode = 200;
    let payload = null;
    const res = {
        status(c) { statusCode = c; return res; },
        json(d) { payload = d; return res; },
        send(d) { payload = d; return res; },
        setHeader() {},
        end() { return res; }
    };
    return { res, get status() { return statusCode; }, get payload() { return payload; } };
}

const USER = { userId: 'u1', id: 'u1', username: 'root', email: 'r@t.c', role: 'super_admin', zona_id: null };

function setup({ invoice, fileTypes = [], fileRows = [] }) {
    const app = createFakeApp();
    const supabase = createMockSupabase({
        'invoice_file_list.select': () => ({ data: invoice, error: null }),
        'invoice_files.select': () => ({ data: fileTypes.map(t => ({ file_type: t })), error: null })
    });
    // Route invoice_files untuk query path (select file_type, file_path)
    const origFrom = supabase.from.bind(supabase);
    supabase.from = (table) => {
        const builder = origFrom(table);
        if (table === 'invoice_files') {
            const origSelect = builder.select;
            builder.select = (cols) => {
                if (String(cols).includes('file_path')) {
                    return makeQuery(() => ({ data: fileRows, error: null }));
                }
                return origSelect(cols);
            };
        }
        return builder;
    };

    const R2Fake = {
        downloadFile: async () => Buffer.from('%PDF-1.4 fake'),
        checkFileExistsNoCache: async () => false
    };
    registerInvoiceEndpoints(app, supabase, () => [], R2Fake);
    return app;
}

const BASE_INVOICE = {
    faktur: '835100310010126011',
    keterangan: 'NON PPN',
    zona_id: 10,
    invoice_pdf_path: null,
    uploaded_file_path: null,
    bukti_bayar_path: 'ARSIP/BEKASI/bukti-bayar/2026/JANUARI/01/835100310010126011.pdf',
    faktur_pajak_path: 'ARSIP/BEKASI/Faktur-Pajak/2026/JANUARI/01/835100310010126011.pdf',
    files_uploaded_count: 2,
    files_required_count: 2
};

describe('Endpoint combine-pdf - aman (tidak menggabung sebagian)', () => {

    test('file wajib hilang -> 400 dengan pesan jelas (bukan PDF sebagian)', async () => {
        const app = setup({ invoice: { ...BASE_INVOICE }, fileTypes: ['bukti_bayar', 'faktur_pajak'] });
        const handler = app.routes['GET /api/invoice/combine-pdf/:faktur'];

        const rr = createRes();
        await handler({ params: { faktur: BASE_INVOICE.faktur }, query: {}, headers: {}, user: USER, ip: '127.0.0.1' }, rr.res);

        expect(rr.status).toBe(400);
        expect(rr.payload.error).toContain('Invoice PDF');
        expect(rr.payload.missing).toEqual(['invoice']);
        expect(rr.payload.status).toBe('1/2');
    });

    test('semua file wajib ada -> lanjut ke proses gabungan (bukan 400)', async () => {
        const app = setup({
            invoice: {
                ...BASE_INVOICE,
                invoice_pdf_path: 'ARSIP/BEKASI/NON/2026/JANUARI/01/835100310010126011.pdf'
            },
            fileTypes: ['invoice', 'bukti_bayar'],
            fileRows: [
                { file_type: 'invoice', file_path: 'ARSIP/BEKASI/NON/2026/JANUARI/01/835100310010126011.pdf' },
                { file_type: 'bukti_bayar', file_path: 'ARSIP/BEKASI/bukti-bayar/2026/JANUARI/01/835100310010126011.pdf' }
            ]
        });
        const handler = app.routes['GET /api/invoice/combine-pdf/:faktur'];

        const rr = createRes();
        await handler({ params: { faktur: BASE_INVOICE.faktur }, query: {}, headers: {}, user: USER, ip: '127.0.0.1' }, rr.res);

        // Tidak ditolak dengan 400 "file belum lengkap"
        expect(rr.status).not.toBe(400);
    });

    test('file tercatat di invoice_files (kolom path kosong) -> tetap dianggap ada', async () => {
        const app = setup({
            invoice: {
                ...BASE_INVOICE,
                invoice_pdf_path: null,
                uploaded_file_path: null
            },
            fileTypes: ['invoice', 'bukti_bayar', 'faktur_pajak'],
            fileRows: [
                { file_type: 'invoice', file_path: 'ARSIP/BEKASI/NON/2026/JANUARI/01/835100310010126011.pdf' },
                { file_type: 'bukti_bayar', file_path: 'ARSIP/BEKASI/bukti-bayar/2026/JANUARI/01/835100310010126011.pdf' }
            ]
        });
        const handler = app.routes['GET /api/invoice/combine-pdf/:faktur'];

        const rr = createRes();
        await handler({ params: { faktur: BASE_INVOICE.faktur }, query: {}, headers: {}, user: USER, ip: '127.0.0.1' }, rr.res);

        expect(rr.status).not.toBe(400);
    });
});
