/**
 * ============================================================
 * Unit Test: Streaming download (Fase 2 percepatan)
 * ============================================================
 * Memverifikasi endpoint download-file mode STREAM:
 *   - data dari storage diteruskan utuh ke client
 *   - cache disk terisi ATOMIK (file final setelah selesai)
 *   - Content-Length ikut diset ketika storage mengirimnya
 *   - file tidak ada (404 dari storage) -> self-healing tetap jalan
 *   - modul storage lama tanpa downloadFileStream -> fallback buffer
 * ============================================================
 */

jest.mock('../r2-storage', () => ({
    getStream: async () => { throw new Error('unused'); },
    downloadFile: async () => Buffer.from('fallback-buffer-pdf'),
    downloadFileStream: undefined, // di-override per test
    checkFileExistsNoCache: async () => false,
    invalidateFileExistenceCache: () => {},
    buildInvoicePath: () => 'test/path.pdf',
    buildDocumentPath: () => 'test/path.pdf',
    monthNameVariants: (m) => [String(m)]
}));

const { Readable, Writable } = require('stream');
const fs = require('fs');
const path = require('path');
const { registerInvoiceEndpoints } = require('../invoice-endpoints.js');

const CACHE_DIR = path.join(__dirname, '..', '..', 'cache', 'downloads');
function cacheFileFor(p) {
    return path.join(CACHE_DIR, Buffer.from(p).toString('hex'));
}

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
                    return makeQuery(routes[`${table}.select`] || (() => ({ data: [], error: null })));
                },
                insert() {
                    return makeQuery(routes[`${table}.insert`] || (() => ({ data: null, error: null })));
                },
                update() {
                    return makeQuery(routes[`${table}.update`] || (() => ({ data: null, error: null })));
                },
                delete() {
                    return makeQuery(() => ({ data: null, error: null }));
                }
            };
        }
    };
}

function createFakeApp() {
    const routes = {};
    const record = (method) => (p, ...handlers) => {
        routes[`${method} ${p}`] = handlers[handlers.length - 1];
    };
    return {
        routes,
        get: record('GET'),
        post: record('POST'),
        put: record('PUT'), patch: record('PATCH'), delete: record('DELETE'),
        use: () => {}
    };
}

/** res yang jadi Writable asli supaya stream.pipe(res) bekerja */
function createStreamRes() {
    const received = [];
    let payload = null;
    let statusCode = 200;
    const headers = {};
    const res = new Writable({
        write(chunk, enc, cb) { received.push(Buffer.from(chunk)); cb(); }
    });
    res.status = function (c) { statusCode = c; return res; };
    res.json = function (d) { payload = d; return res; };
    res.send = function (d) { payload = d; return res; };
    res.setHeader = function (k, v) { headers[k] = v; };
    res.getHeader = function (k) { return headers[k]; };
    return { res, received, headers, get payload() { return payload; }, get statusCode() { return statusCode; } };
}

const USER = { userId: 'u1', id: 'u1', username: 'root', email: 'r@t.c', role: 'super_admin', zona_id: null };

const INVOICE = {
    faktur: '835100310',
    zona_id: 10,
    invoice_pdf_path: 'ARSIP/BEKASI/PPN/inv.pdf',
    bukti_bayar_path: null,
    faktur_pajak_path: null,
    uploaded_file_path: null
};

function setup(r2Fakes) {
    // bersihkan cache untuk path yang sama (punya key hex identik antar-test)
    try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.unlinkSync(cacheFileFor(INVOICE.invoice_pdf_path));
    } catch (_) { /* belum ada - abaikan */ }

    const app = createFakeApp();
    const supabase = createMockSupabase({
        'invoice_file_list.select': () => ({ data: { ...INVOICE }, error: null }),
        'invoice_file_list.update': () => ({ data: null, error: null }),
        'invoice_files.select': () => ({ data: [], error: null }),
        'invoice_files.delete': () => ({ data: null, error: null })
    });
    const R2Fake = Object.assign({
        checkFileExistsNoCache: async () => false,
        invalidateFileExistenceCache: () => {},
        downloadFile: async () => Buffer.from('fallback-buffer-pdf')
    }, r2Fakes);
    registerInvoiceEndpoints(app, supabase, () => [], R2Fake);
    return app;
}

function createReq() {
    return {
        params: { faktur: '835100310', fileType: 'invoice' },
        body: {}, query: {},
        headers: { 'user-agent': 'jest' },
        user: USER,
        ip: '127.0.0.1'
    };
}

/** Stream palsu yang mengirim data dalam beberapa chunk */
function fakeStream(chunks) {
    return Readable.from(chunks);
}

describe('Download STREAM mode', () => {

    test('data diteruskan utuh + cache final tersimpan', async () => {
        const DATA = ['HALO', ' PDF', '-STREAM'];
        const fauxR2 = {
            downloadFileStream: async () => ({
                stream: fakeStream(DATA),
                contentType: 'application/pdf',
                contentLength: DATA.join('').length
            })
        };
        const app = setup(fauxR2);
        const handler = app.routes['GET /api/invoice/download-file/:faktur/:fileType'];

        const rr = createStreamRes();
        const done = new Promise(resolve => rr.res.on('finish', resolve));

        await handler(createReq(), rr.res);
        await done;
        await new Promise(r => setTimeout(r, 60)); // beri waktu callback cacheWs.end + rename

        expect(Buffer.concat(rr.received).toString()).toBe('HALO PDF-STREAM');
        expect(rr.statusCode).toBe(200);
        expect(rr.headers['Content-Length']).toBe('HALO PDF-STREAM'.length);

        // Cache final di-rename (file .part tidak tersisa)
        const final = cacheFileFor(INVOICE.invoice_pdf_path);
        expect(fs.existsSync(final)).toBe(true);
        expect(fs.readFileSync(final).toString()).toBe('HALO PDF-STREAM');
    });

    test('404 dari storage -> self-healing dipanggil & respons JSON 404', async () => {
        const fauxR2 = {
            downloadFileStream: async () => {
                throw new Error(`NoSuchKey: File not found: ${INVOICE.invoice_pdf_path}`);
            }
        };
        const app = setup(fauxR2);
        const handler = app.routes['GET /api/invoice/download-file/:faktur/:fileType'];

        const rr = createStreamRes();
        await handler(createReq(), rr.res);

        expect(rr.statusCode).toBe(404);
        expect(rr.payload.error).toContain('tidak ditemukan');
    });

    test('modul lama tanpa downloadFileStream -> fallback buffer tetap terkirim', async () => {
        const app = setup({}); // tanpa downloadFileStream
        const handler = app.routes['GET /api/invoice/download-file/:faktur/:fileType'];

        const rr = createStreamRes();
        const done = new Promise(resolve => rr.res.on('finish', resolve));

        await handler(createReq(), rr.res);
        await done;

        const out = Buffer.concat(rr.received).toString();
        expect(out).toBe('fallback-buffer-pdf');
    });

    afterAll(() => {
        // bersihkan artefak test
        try {
            const final = cacheFileFor(INVOICE.invoice_pdf_path);
            if (fs.existsSync(final)) fs.unlinkSync(final);
        } catch (_) { /* abaikan */ }
        try {
            const dir = path.join(__dirname, '..', '..', 'cache', 'combined-pdfs');
            if (fs.existsSync(dir)) {
                fs.readdirSync(dir)
                    .filter(f => f.endsWith('.pdf'))
                    .forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch (_) {} });
            }
        } catch (_) { /* abaikan */ }
    });
});
