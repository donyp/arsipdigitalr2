/**
 * ============================================================
 * Unit Test: Keamanan endpoint download terkait (Fase 1 audit download)
 * ============================================================
 * Memverifikasi:
 *   - check-faktur                     : admin_zona zona lain -> 403
 *   - check-faktur (zona cocok)        -> 200, TANPA kolom path internal
 *   - check-fakturs-batch              : baris zona lain dianggap tidak ada
 *   - combine-pdf                      : admin_zona zona lain -> 403
 *   - combine-pdf (super_admin)        -> tidak ditolak zona
 * ============================================================
 */

// r2-storage asli membuka interval background -> jest tidak pernah selesai
jest.mock('../r2-storage', () => ({
    downloadFile: jest.fn(async () => { throw new Error('File not found: test.pdf'); }),
    checkFileExistsNoCache: async () => false,
    checkFileExists: async () => false,
    invalidateFileExistenceCache: () => {},
    getConfig: () => ({ bucketName: 'test-bucket' }),
    getS3Client: () => ({}),
    listFiles: async () => [],
    deleteFile: async () => {},
    buildInvoicePath: () => 'test/path.pdf',
    buildDocumentPath: () => 'test/path.pdf',
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
        limit: () => q,
        order: () => q,
        range: () => q,
        maybeSingle: () => q,
        single: () => q,
        then: (resolve, reject) =>
            Promise.resolve(typeof resolver === 'function' ? resolver(args) : resolver).then(resolve, reject)
    };
    return q;
}

function createMockSupabase(routes = {}) {
    const calls = [];
    return {
        calls,
        from(table) {
            return {
                select() {
                    calls.push({ table, op: 'select' });
                    const key = `${table}.select`;
                    return makeQuery(routes[key] || (() => ({ data: [], error: null })));
                },
                insert(payload) {
                    calls.push({ table, op: 'insert', payload });
                    return makeQuery(routes[`${table}.insert`] || (() => ({ data: null, error: null })));
                },
                update(payload) {
                    calls.push({ table, op: 'update', payload });
                    return makeQuery(routes[`${table}.update`] || (() => ({ data: null, error: null })));
                },
                delete() {
                    calls.push({ table, op: 'delete' });
                    return makeQuery(() => ({ data: null, error: null }));
                }
            };
        }
    };
}

function createFakeApp() {
    const routes = {};
    const record = (method) => (path, ...handlers) => {
        routes[`${method} ${path}`] = handlers[handlers.length - 1];
    };
    return {
        routes,
        get: record('GET'),
        post: record('POST'),
        put: record('PUT'),
        patch: record('PATCH'),
        delete: record('DELETE'),
        use: () => {}
    };
}

function createReqRes(body = {}, params = {}) {
    const req = {
        body,
        params,
        query: {},
        headers: { 'user-agent': 'jest' },
        user: null,
        ip: '127.0.0.1'
    };
    let statusCode = 200;
    let payload = null;
    const res = {
        status(code) { statusCode = code; return res; },
        json(data) { payload = data; return res; },
        send(data) { payload = data; return res; },
        setHeader() {}
    };
    return {
        req,
        res,
        get status() { return statusCode; },
        get payload() { return payload; }
    };
}

const adminZonaUser = { userId: 'u1', id: 'u1', username: 'zona10', email: 'z10@t.c', role: 'admin_zona', zona_id: 10 };
const superAdminUser = { userId: 'u9', id: 'u9', username: 'root', email: 'root@t.c', role: 'super_admin', zona_id: 1 };

const INVOICE_ROW = {
    faktur: '835100310',
    status: 'done',
    toko: 'Toko A',
    tanggal: '2026-08-15',
    konsumen: 'Konsumen A',
    total_jumlah_jual: 123000,
    keterangan: 'PPN',
    uploaded_file_path: null,
    invoice_pdf_path: 'ARSIP/PEMALANG/PPN/a.pdf',
    bukti_bayar_path: 'ARSIP/PEMALANG/bukti-bayar/b.pdf',
    faktur_pajak_path: null,
    zona_id: 10
};

function setup(selectResolver) {
    const app = createFakeApp();
    const supabase = createMockSupabase({ 'invoice_file_list.select': selectResolver });
    registerInvoiceEndpoints(app, supabase, () => [], {
        downloadFile: async () => { throw new Error('File not found: x'); },
        checkFileExistsNoCache: async () => false
    });
    return app;
}

describe('SECURITY check-faktur', () => {

    test('admin_zona zona lain -> 403 (tidak bocor metadata)', async () => {
        const app = setup(() => ({ data: { ...INVOICE_ROW, zona_id: 11 }, error: null }));
        const handler = app.routes['GET /api/invoice/check-faktur/:faktur'];

        const rr = createReqRes({}, { faktur: '835100310' });
        rr.req.user = adminZonaUser;
        await handler(rr.req, rr.res);

        expect(rr.status).toBe(403);
        expect(rr.payload.error).toContain('Akses ditolak');
    });

    test('admin_zona zona cocok -> 200 dengan flag has_* tanpa kolom path', async () => {
        const app = setup(() => ({ data: INVOICE_ROW, error: null }));
        const handler = app.routes['GET /api/invoice/check-faktur/:faktur'];

        const rr = createReqRes({}, { faktur: '835100310' });
        rr.req.user = adminZonaUser;
        await handler(rr.req, rr.res);

        expect(rr.status).toBe(200);
        expect(rr.payload.exists).toBe(true);

        const d = rr.payload.data;
        expect(d.has_invoice).toBe(true);
        expect(d.has_bukti_bayar).toBe(true);
        expect(d.has_faktur_pajak).toBe(false);
        expect(d.total_jumlah_jual).toBe(123000);

        // TIDAK BOLEH ada kolom path internal
        expect(d.invoice_pdf_path).toBeUndefined();
        expect(d.bukti_bayar_path).toBeUndefined();
        expect(d.faktur_pajak_path).toBeUndefined();
        expect(d.uploaded_file_path).toBeUndefined();
        expect(d.zona_id).toBeUndefined();
    });

    test('super_admin dapat akses zona mana pun', async () => {
        const app = setup(() => ({ data: { ...INVOICE_ROW, zona_id: 11 }, error: null }));
        const handler = app.routes['GET /api/invoice/check-faktur/:faktur'];

        const rr = createReqRes({}, { faktur: '835100310' });
        rr.req.user = superAdminUser;
        await handler(rr.req, rr.res);

        expect(rr.status).toBe(200);
        expect(rr.payload.exists).toBe(true);
    });

    test('faktur tidak ada -> exists false', async () => {
        const app = setup(() => ({ data: null, error: { code: 'PGRST116', message: 'not found' } }));
        const handler = app.routes['GET /api/invoice/check-faktur/:faktur'];

        const rr = createReqRes({}, { faktur: '999' });
        rr.req.user = superAdminUser;
        await handler(rr.req, rr.res);

        expect(rr.status).toBe(200);
        expect(rr.payload.exists).toBe(false);
        expect(rr.payload.data).toBeNull();
    });
});

describe('SECURITY check-fakturs-batch', () => {

    test('admin_zona hanya melihat faktur zonanya (zona lain dianggap tidak ada)', async () => {
        const ROWS = [
            { ...INVOICE_ROW, faktur: '835100310', zona_id: 10 },
            { ...INVOICE_ROW, faktur: '835100311', zona_id: 11 },
            { ...INVOICE_ROW, faktur: '835100312', zona_id: null }   // data lama: tetap terlihat
        ];
        const app = setup(() => ({ data: ROWS, error: null }));
        const handler = app.routes['POST /api/invoice/check-fakturs-batch'];

        const rr = createReqRes({ fakturs: ['835100310', '835100311', '835100312'] });
        rr.req.user = adminZonaUser;
        await handler(rr.req, rr.res);

        expect(rr.status).toBe(200);
        expect(rr.payload.results['835100310'].exists).toBe(true);
        expect(rr.payload.results['835100311'].exists).toBe(false);   // zona lain
        expect(rr.payload.results['835100312'].exists).toBe(true);    // data lama tanpa zona
        expect(rr.payload.found).toBe(2);

        // Tanpa kolom path
        const d = rr.payload.results['835100310'].data;
        expect(d.has_invoice).toBe(true);
        expect(d.invoice_pdf_path).toBeUndefined();
    });

    test('super_admin melihat semua faktur', async () => {
        const ROWS = [
            { ...INVOICE_ROW, faktur: '835100310', zona_id: 10 },
            { ...INVOICE_ROW, faktur: '835100311', zona_id: 11 }
        ];
        const app = setup(() => ({ data: ROWS, error: null }));
        const handler = app.routes['POST /api/invoice/check-fakturs-batch'];

        const rr = createReqRes({ fakturs: ['835100310', '835100311'] });
        rr.req.user = superAdminUser;
        await handler(rr.req, rr.res);

        expect(rr.payload.found).toBe(2);
    });
});

describe('SECURITY combine-pdf', () => {

    test('admin_zona zona lain -> 403, tidak sampai ke proses gabung', async () => {
        const app = setup(() => ({ data: { ...INVOICE_ROW, zona_id: 11 }, error: null }));

        const handler = app.routes['GET /api/invoice/combine-pdf/:faktur'];
        expect(handler).toBeDefined();

        const rr = createReqRes({}, { faktur: '835100310' });
        rr.req.user = adminZonaUser;
        await handler(rr.req, rr.res);

        expect(rr.status).toBe(403);
    });

    test('super_admin zona lain -> tidak ditolak zona (lanjut ke proses berikutnya)', async () => {
        const app = setup(() => ({
            data: {
                ...INVOICE_ROW,
                zona_id: 11,
                files_uploaded_count: 3,
                invoice_pdf_path: 'a.pdf',
                bukti_bayar_path: 'b.pdf',
                faktur_pajak_path: 'c.pdf'
            },
            error: null
        }));

        const handler = app.routes['GET /api/invoice/combine-pdf/:faktur'];

        const rr = createReqRes({}, { faktur: '835100310' });
        rr.req.user = superAdminUser;
        await handler(rr.req, rr.res);

        // Bukan 403 -> lolos verifikasi zona (nanti gagal di storage, 500)
        expect(rr.status).not.toBe(403);
    });

    test('admin_zona zona cocok -> tidak ditolak zona', async () => {
        const app = setup(() => ({
            data: { ...INVOICE_ROW, files_uploaded_count: 3 },
            error: null
        }));

        const handler = app.routes['GET /api/invoice/combine-pdf/:faktur'];

        const rr = createReqRes({}, { faktur: '835100310' });
        rr.req.user = adminZonaUser;
        await handler(rr.req, rr.res);

        expect(rr.status).not.toBe(403);
    });
});
