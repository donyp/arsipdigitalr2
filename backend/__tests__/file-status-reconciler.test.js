/**
 * ============================================================
 * Unit Test: Reconciler Status File
 * ============================================================
 * Menguji backend/file-status-reconciler.js:
 *   - menghitung ulang count dari sumber tunggal
 *   - melengkapi (backfill) kolom path yang kosong dari invoice_files
 *   - menandai invoice yang perlu diperiksa
 *   - mode verify_r2: file yang hilang di storage -> path dikosongkan
 *   - melewati invoice yang baru saja di-update (upload sedang berjalan)
 * ============================================================
 */

const { FileStatusReconciler } = require('../file-status-reconciler.js');

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
                select(cols) {
                    calls.push({ table, op: 'select', cols });
                    const key = `${table}.select`;
                    return makeQuery(routes[key] ? routes[key] : () => ({ data: [], error: null }));
                },
                insert(payload) {
                    calls.push({ table, op: 'insert', payload });
                    return makeQuery(() => ({ data: null, error: null }));
                },
                update(payload) {
                    const call = { table, op: 'update', payload, eqVal: null };
                    calls.push(call);
                    const key = `${table}.update`;
                    const q = makeQuery(routes[key] ? routes[key] : () => ({ data: null, error: null }));
                    const origEq = q.eq;
                    q.eq = (col, val) => { call.eqVal = val; return origEq(col, val); };
                    return q;
                },
                delete() {
                    const call = { table, op: 'delete', eqVal: null };
                    calls.push(call);
                    const q = makeQuery(() => ({ data: null, error: null }));
                    const origEq = q.eq;
                    q.eq = (col, val) => { call.eqVal = val; return origEq(col, val); };
                    return q;
                }
            };
        }
    };
}

const INVOICES = [
    {
        faktur: 'F1', keterangan: 'PPN',
        invoice_pdf_path: 'a.pdf', bukti_bayar_path: 'b.pdf', faktur_pajak_path: 'c.pdf',
        files_uploaded_count: 0, files_required_count: 0, updated_at: null
    },
    {
        faktur: 'F2', keterangan: 'NON',
        invoice_pdf_path: 'x.pdf', bukti_bayar_path: null, faktur_pajak_path: null,
        files_uploaded_count: 5, files_required_count: 9, updated_at: null
    }
];

describe('FileStatusReconciler', () => {

    test('menghitung ulang count yang salah', async () => {
        const supabase = createMockSupabase({
            'invoice_file_list.select': () => ({ data: INVOICES, error: null }),
            'invoice_files.select': () => ({ data: [], error: null })
        });

        const r = new FileStatusReconciler(supabase, null);
        const res = await r.run({});

        expect(res.success).toBe(true);
        expect(res.total).toBe(2);

        const updates = supabase.calls.filter(c => c.op === 'update' && c.table === 'invoice_file_list');
        const byFaktur = {};
        updates.forEach(u => { byFaktur[u.eqVal] = u.payload; });

        expect(byFaktur.F1.files_uploaded_count).toBe(3);
        expect(byFaktur.F1.files_required_count).toBe(3);
        expect(byFaktur.F2.files_uploaded_count).toBe(1);
        expect(byFaktur.F2.files_required_count).toBe(2);
    });

    test('backfill kolom path yang kosong dari invoice_files', async () => {
        const invoices = [{
            faktur: 'F1', keterangan: 'NON',
            invoice_pdf_path: null, bukti_bayar_path: null, faktur_pajak_path: null,
            files_uploaded_count: 0, files_required_count: 0, updated_at: null
        }];

        const supabase = createMockSupabase({
            'invoice_file_list.select': () => ({ data: invoices, error: null }),
            'invoice_files.select': () => ({
                data: [{ faktur: 'F1', file_type: 'invoice', file_path: 'ARSIP/x.pdf' }],
                error: null
            })
        });

        const r = new FileStatusReconciler(supabase, null);
        const res = await r.run({ backfillPaths: true });

        expect(res.pathBackfilled).toBe(1);

        const upd = supabase.calls.find(c => c.op === 'update');
        expect(upd.payload.invoice_pdf_path).toBe('ARSIP/x.pdf');
        expect(upd.payload.files_uploaded_count).toBe(1);
    });

    test('melewati invoice yang baru saja di-update', async () => {
        const invoices = [{
            faktur: 'F1', keterangan: 'NON',
            invoice_pdf_path: 'a.pdf', bukti_bayar_path: null, faktur_pajak_path: null,
            files_uploaded_count: 0, files_required_count: 0,
            updated_at: new Date().toISOString()   // baru saja
        }];

        const supabase = createMockSupabase({
            'invoice_file_list.select': () => ({ data: invoices, error: null }),
            'invoice_files.select': () => ({ data: [], error: null })
        });

        const r = new FileStatusReconciler(supabase, null, { skipRecentlyUpdatedMinutes: 10 });
        const res = await r.run({});

        expect(res.skipped).toBe(1);
        expect(supabase.calls.find(c => c.op === 'update')).toBeUndefined();
    });

    test('verify_r2: file yang hilang di storage -> path dikosongkan & count turun', async () => {
        const invoices = [{
            faktur: 'F1', keterangan: 'NON',
            invoice_pdf_path: 'gone.pdf', bukti_bayar_path: 'b.pdf', faktur_pajak_path: null,
            files_uploaded_count: 2, files_required_count: 2, updated_at: null
        }];

        const r2 = {
            checkFileExistsNoCache: async (p) => p !== 'gone.pdf'   // gone.pdf tidak ada
        };

        const supabase = createMockSupabase({
            'invoice_file_list.select': () => ({ data: invoices, error: null }),
            'invoice_files.select': () => ({ data: [{ faktur: 'F1', file_type: 'invoice', file_path: 'gone.pdf' }], error: null })
        });

        const r = new FileStatusReconciler(supabase, r2);
        const res = await r.run({ verifyR2: true });

        expect(res.r2Checked).toBeGreaterThan(0);
        expect(res.r2Missing).toBe(1);
        expect(res.pathCleared).toBe(1);

        const upd = supabase.calls.find(c => c.op === 'update');
        expect(upd.payload.invoice_pdf_path).toBeNull();
        expect(upd.payload.files_uploaded_count).toBe(1);

        // record invoice_files ikut dihapus
        expect(supabase.calls.find(c => c.table === 'invoice_files' && c.op === 'delete')).toBeDefined();
    });

    test('gagal cek R2 tidak dianggap file hilang', async () => {
        const invoices = [{
            faktur: 'F1', keterangan: 'NON',
            invoice_pdf_path: 'a.pdf', bukti_bayar_path: null, faktur_pajak_path: null,
            files_uploaded_count: 1, files_required_count: 2, updated_at: null
        }];

        const r2 = {
            checkFileExistsNoCache: async () => { throw new Error('network down'); }
        };

        const supabase = createMockSupabase({
            'invoice_file_list.select': () => ({ data: invoices, error: null }),
            'invoice_files.select': () => ({ data: [], error: null })
        });

        const r = new FileStatusReconciler(supabase, r2);
        const res = await r.run({ verifyR2: true });

        expect(res.r2Missing).toBe(0);
        expect(res.pathCleared).toBe(0);
    });

    test('normalisasi keterangan (kapitalisasi saja)', async () => {
        const invoices = [{
            faktur: 'F1', keterangan: 'ppn',
            invoice_pdf_path: 'a.pdf', bukti_bayar_path: null, faktur_pajak_path: null,
            files_uploaded_count: 1, files_required_count: 3, updated_at: null
        }];

        const supabase = createMockSupabase({
            'invoice_file_list.select': () => ({ data: invoices, error: null }),
            'invoice_files.select': () => ({ data: [], error: null })
        });

        const r = new FileStatusReconciler(supabase, null);
        const res = await r.run({ normalizeKeterangan: true });

        expect(res.keteranganNormalized).toBe(1);
        const upd = supabase.calls.find(c => c.op === 'update');
        expect(upd.payload.keterangan).toBe('PPN');
    });

    test('menolak jalan dua kali bersamaan', async () => {
        const supabase = createMockSupabase({
            'invoice_file_list.select': () => ({ data: INVOICES, error: null }),
            'invoice_files.select': () => ({ data: [], error: null })
        });

        const r = new FileStatusReconciler(supabase, null);
        const first = r.run({});
        const second = await r.run({});
        await first;

        expect(second.success).toBe(false);
        expect(second.error).toContain('berjalan');
    });
});
