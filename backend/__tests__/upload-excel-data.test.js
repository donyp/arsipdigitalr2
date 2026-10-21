/**
 * ============================================================
 * Unit Test: Endpoint /api/invoice/upload-excel-data
 * ============================================================
 * Menguji logika upload Excel yang diperbaiki:
 *   C2  duplikat dipisah, tidak menggagalkan seluruh batch
 *   C4  query ke tabel toko hanya 1x (bukan 1x per baris)
 *   H3  baris tidak valid DITOLAK & dilaporkan
 *   H7  insert per chunk 500 baris
 *   M4  status batch mencerminkan hasil sebenarnya
 *   M6  tidak ada data baru -> tidak membuat batch
 *
 * Supabase dimock penuh (tidak menyentuh database).
 * ============================================================
 */

const { registerInvoiceEndpoints } = require('../invoice-endpoints.js');

// Mock r2-storage: modul aslinya membuka interval sync worker sehingga
// proses jest tidak pernah selesai (open handle).
jest.mock('../r2-storage', () => {
    const monthNames = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
    const convertMonthToName = (m) => {
        if (typeof m === 'string' && isNaN(m)) return m.toUpperCase();
        const n = parseInt(m, 10);
        return (n >= 1 && n <= 12) ? monthNames[n - 1] : String(m).toUpperCase();
    };
    return {
        buildInvoicePath: ({ location, category, year, month, day, filename }) =>
            `ARSIP/${location}/${category}/${year}/${convertMonthToName(month)}/${day}/${filename}`,
        buildDocumentPath: ({ location, folderType, year, month, day, filename }) =>
            `ARSIP/${location}/${folderType}/${year}/${convertMonthToName(month)}/${day}/${filename}`,
        monthNameVariants: (m) => [String(m)],
        checkFileExistsNoCache: async () => false,
        checkFileExists: async () => false,
        invalidateFileExistenceCache: () => {},
        getConfig: () => ({ bucketName: 'test-bucket' }),
        getS3Client: () => ({}),
        listFiles: async () => [],
        deleteFile: async () => {},
        downloadFile: async () => Buffer.alloc(0),
        uploadInvoicePDF: async () => ({ storagePath: 'test/path.pdf' }),
        uploadDocumentFile: async () => ({ storagePath: 'test/path.pdf' })
    };
});

/**
 * Mock query builder yang bisa di-await.
 */
function makeQuery(resolver) {
    const args = { in: null, eq: null };
    const q = {
        _args: args,
        select: () => q,
        in: (col, vals) => { args.in = { col, vals }; return q; },
        eq: (col, val) => { args.eq = { col, val }; return q; },
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

/**
 * Mock supabase: from(table) -> { select, insert, update, delete }
 * routes: { 'table.select': (args) => result, 'table.insert': (payload) => result, ... }
 */
function createMockSupabase(routes = {}) {
    const calls = [];
    const supabase = {
        calls,
        from(table) {
            return {
                select(cols) {
                    calls.push({ table, op: 'select', cols });
                    const key = `${table}.select`;
                    return makeQuery(routes[key] ? routes[key] : () => ({ data: [], error: null }));
                },
                insert(payload) {
                    calls.push({ table, op: 'insert', payload });
                    const key = `${table}.insert`;
                    // resolver menerima payload (bukan args query)
                    return makeQuery(routes[key] ? () => routes[key](payload) : () => ({ data: null, error: null }));
                },
                update(payload) {
                    calls.push({ table, op: 'update', payload });
                    const key = `${table}.update`;
                    return makeQuery(routes[key] ? () => routes[key](payload) : () => ({ data: null, error: null }));
                },
                delete() {
                    calls.push({ table, op: 'delete' });
                    const key = `${table}.delete`;
                    return makeQuery(routes[key] ? routes[key] : () => ({ data: null, error: null }));
                }
            };
        }
    };
    return supabase;
}

/** App fake untuk menangkap route yang didaftarkan */
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

/** Req/res fake untuk memanggil handler */
function createReqRes(body = {}) {
    const req = {
        body,
        query: {},
        params: {},
        headers: { 'user-agent': 'jest' },
        user: { id: 'u1', userId: 'u1', username: 'admin', email: 'a@b.c', role: 'super_admin' },
        ip: '127.0.0.1'
    };
    let statusCode = 200;
    let payload = null;
    const res = {
        status(code) { statusCode = code; return res; },
        json(data) { payload = data; return res; },
        send(data) { payload = data; return res; },
        get _status() { return statusCode; },
        get _payload() { return payload; }
    };
    return { req, res, get status() { return statusCode; }, get payload() { return payload; } };
}

describe('POST /api/invoice/upload-excel-data', () => {
    let app;
    let handler;

    const TOKOS = [
        { id: 1, nama: 'Pasar Kemis', zona_id: 10 },
        { id: 2, nama: 'Balaraja', zona_id: 11 },
        { id: 3, nama: 'ANKA BEKASI', zona_id: 12 }
    ];

    function setup(routes) {
        app = createFakeApp();
        const supabase = createMockSupabase(routes);
        const createAuth = () => []; // tidak ada middleware auth
        registerInvoiceEndpoints(app, supabase, createAuth, { checkFileExistsNoCache: async () => false });
        handler = app.routes['POST /api/invoice/upload-excel-data'];
        return { supabase };
    }

    const row = (faktur, extra = {}) => ({
        tanggal: '2026-08-15',
        toko: 'Pasar Kemis',
        faktur,
        metode_bayar: 'Piutang',
        jenis_transaksi: 'jual',
        konsumen: 'Pasar Kemis',
        total_jumlah_jual: 1000,
        keterangan: 'PPN',
        ...extra
    });

    test('data valid -> tersimpan & zona_id terisi dari KONSUMEN', async () => {
        const { supabase } = setup({
            'invoice_file_list.select': () => ({ data: [], error: null }),
            'toko.select': () => ({ data: TOKOS, error: null })
        });

        const rr = createReqRes({ filename: 'a.xlsx', data: [row('835100310')] });
        await handler(rr.req, rr.res);

        expect(rr.status).toBe(200);
        expect(rr.payload.success).toBe(true);
        expect(rr.payload.summary.processed).toBe(1);
        expect(rr.payload.summary.duplicates).toBe(0);
        expect(rr.payload.summary.rejected).toBe(0);

        const insert = supabase.calls.find(c => c.table === 'invoice_file_list' && c.op === 'insert');
        expect(insert).toBeDefined();
        expect(insert.payload[0].faktur).toBe('835100310');
        expect(insert.payload[0].zona_id).toBe(10);   // match via KONSUMEN
        expect(insert.payload[0].tanggal).toBe('2026-08-15');
    });

    test('C4: query ke tabel toko hanya 1x walau banyak baris', async () => {
        const { supabase } = setup({
            'invoice_file_list.select': () => ({ data: [], error: null }),
            'toko.select': () => ({ data: TOKOS, error: null })
        });

        const data = Array.from({ length: 50 }, (_, i) => row(`8351${String(i).padStart(6, '0')}`));
        const rr = createReqRes({ filename: 'a.xlsx', data });
        await handler(rr.req, rr.res);

        const tokoQueries = supabase.calls.filter(c => c.table === 'toko');
        expect(tokoQueries.length).toBe(1);
    });

    test('C2: faktur duplikat dipisah, data baru tetap masuk', async () => {
        const { supabase } = setup({
            // F1 sudah ada di database
            'invoice_file_list.select': () => ({ data: [{ faktur: '835100310' }], error: null }),
            'toko.select': () => ({ data: TOKOS, error: null })
        });

        const rr = createReqRes({
            filename: 'a.xlsx',
            data: [row('835100310'), row('835100311'), row('835100312')]
        });
        await handler(rr.req, rr.res);

        expect(rr.status).toBe(200);
        expect(rr.payload.summary.processed).toBe(2);
        expect(rr.payload.summary.duplicates).toBe(1);

        const insert = supabase.calls.find(c => c.table === 'invoice_file_list' && c.op === 'insert');
        expect(insert.payload.map(r => r.faktur).sort()).toEqual(['835100311', '835100312']);
    });

    test('H3: baris tidak valid ditolak & dilaporkan alasannya', async () => {
        const { supabase } = setup({
            'invoice_file_list.select': () => ({ data: [], error: null }),
            'toko.select': () => ({ data: TOKOS, error: null })
        });

        const rr = createReqRes({
            filename: 'a.xlsx',
            data: [
                row('835100310'),
                row('835100311', { tanggal: null }),          // tanggal kosong
                row('ABC123', {}),                        // faktur bukan angka
                row('835100313', { toko: '' })                // toko kosong
            ]
        });
        await handler(rr.req, rr.res);

        expect(rr.payload.summary.processed).toBe(1);
        expect(rr.payload.summary.rejected).toBe(3);
        expect(rr.payload.summary.rejectedRows.length).toBe(3);
        expect(rr.payload.summary.rejectedRows.map(r => r.reason)).toEqual(
            expect.arrayContaining([
                expect.stringContaining('Tanggal kosong'),
                expect.stringContaining('bukan angka'),
                expect.stringContaining('toko kosong')
            ])
        );

        const insert = supabase.calls.find(c => c.table === 'invoice_file_list' && c.op === 'insert');
        expect(insert.payload.length).toBe(1);
    });

    test('C1: tanggal dari berbagai format dinormalisasi ke YYYY-MM-DD', async () => {
        const { supabase } = setup({
            'invoice_file_list.select': () => ({ data: [], error: null }),
            'toko.select': () => ({ data: TOKOS, error: null })
        });

        const rr = createReqRes({
            filename: 'a.xlsx',
            data: [
                row('835100310', { tanggal: '15-08-2026' }),
                row('835100311', { tanggal: '15/08/2026' }),
                row('835100312', { tanggal: '2026-08-15' })
            ]
        });
        await handler(rr.req, rr.res);

        const insert = supabase.calls.find(c => c.table === 'invoice_file_list' && c.op === 'insert');
        expect(insert.payload.map(r => r.tanggal)).toEqual(['2026-08-15', '2026-08-15', '2026-08-15']);
    });

    test('M1: nominal format Indonesia dikonversi benar', async () => {
        const { supabase } = setup({
            'invoice_file_list.select': () => ({ data: [], error: null }),
            'toko.select': () => ({ data: TOKOS, error: null })
        });

        const rr = createReqRes({
            filename: 'a.xlsx',
            data: [row('835100310', { total_jumlah_jual: '1.234,56' })]
        });
        await handler(rr.req, rr.res);

        const insert = supabase.calls.find(c => c.table === 'invoice_file_list' && c.op === 'insert');
        expect(insert.payload[0].total_jumlah_jual).toBe(1234.56);
    });

    test('M6: tidak ada data baru -> tidak membuat batch (no-op)', async () => {
        const { supabase } = setup({
            'invoice_file_list.select': () => ({ data: [{ faktur: '835100310' }], error: null }),
            'toko.select': () => ({ data: TOKOS, error: null })
        });

        const rr = createReqRes({ filename: 'a.xlsx', data: [row('835100310')] });
        await handler(rr.req, rr.res);

        expect(rr.status).toBe(200);
        expect(rr.payload.batchId).toBeNull();
        expect(rr.payload.summary.processed).toBe(0);
        expect(rr.payload.summary.duplicates).toBe(1);

        const batchInsert = supabase.calls.find(c => c.table === 'excel_upload_batches' && c.op === 'insert');
        expect(batchInsert).toBeUndefined();
    });

    test('M4: status batch mencerminkan hasil sebenarnya', async () => {
        const { supabase } = setup({
            'invoice_file_list.select': () => ({ data: [], error: null }),
            'toko.select': () => ({ data: TOKOS, error: null })
        });

        const rr = createReqRes({
            filename: 'a.xlsx',
            data: [row('835100310'), row('835100311', { tanggal: null })]
        });
        await handler(rr.req, rr.res);

        const batchUpdate = supabase.calls.find(c => c.table === 'excel_upload_batches' && c.op === 'update');
        expect(batchUpdate.payload.status).toBe('completed_with_errors');
        expect(batchUpdate.payload.processed_rows).toBe(1);
        expect(batchUpdate.payload.failed_rows).toBe(1);
    });

    test('H7: insert dipecah per chunk 500 baris', async () => {
        const { supabase } = setup({
            'invoice_file_list.select': () => ({ data: [], error: null }),
            'toko.select': () => ({ data: TOKOS, error: null })
        });

        const data = Array.from({ length: 1200 }, (_, i) => row(`8351${String(i).padStart(6, '0')}`));
        const rr = createReqRes({ filename: 'big.xlsx', data });
        await handler(rr.req, rr.res);

        const inserts = supabase.calls.filter(c => c.table === 'invoice_file_list' && c.op === 'insert');
        expect(inserts.length).toBe(3);           // 500 + 500 + 200
        expect(inserts[0].payload.length).toBe(500);
        expect(inserts[2].payload.length).toBe(200);
        expect(rr.payload.summary.processed).toBe(1200);
    });

    test('C2: bentrok saat insert -> fallback per baris, baris lain tetap masuk', async () => {
        let firstCall = true;
        const { supabase } = setup({
            'invoice_file_list.select': () => ({ data: [], error: null }),
            'toko.select': () => ({ data: TOKOS, error: null }),
            'invoice_file_list.insert': (payload) => {
                if (firstCall && Array.isArray(payload)) {
                    firstCall = false;
                    return { data: null, error: { code: '23505', message: 'duplicate key' } };
                }
                return { data: null, error: null };
            }
        });

        const rr = createReqRes({
            filename: 'a.xlsx',
            data: [row('835100310'), row('835100311')]
        });
        await handler(rr.req, rr.res);

        // 1 bulk insert (gagal) + 2 insert per baris
        const inserts = supabase.calls.filter(c => c.table === 'invoice_file_list' && c.op === 'insert');
        expect(inserts.length).toBe(3);
        expect(rr.payload.summary.processed).toBe(2);
        expect(rr.payload.summary.failed).toBe(0);
    });
});
