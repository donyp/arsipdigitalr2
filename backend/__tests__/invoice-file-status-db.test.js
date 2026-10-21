/**
 * ============================================================
 * Unit Test: Modul Status File (perilaku dengan mock database)
 * ============================================================
 * Melengkapi invoice-file-status.test.js (yang menguji perhitungan murni)
 * dengan pengujian fungsi-fungsi yang menyentuh database:
 *   - syncInvoiceFileStatus  : tulis count/required dari sumber tunggal
 *   - clearInvoiceFileRecord : hapus record file (dipakai saat file dihapus)
 *   - findInvoicesByPath     : cari invoice berdasarkan path (hapus dari storage)
 *   - findInvoicesByPrefix   : cari invoice dalam folder (hapus folder)
 * ============================================================
 */

const {
    syncInvoiceFileStatus,
    clearInvoiceFileRecord,
    findInvoicesByPath,
    findInvoicesByPrefix,
    deleteInvoiceFileRow
} = require('../invoice-file-status.js');

/** Mock query builder yang bisa di-await */
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
                    const key = `${table}.insert`;
                    return makeQuery(routes[key] ? routes[key] : () => ({ data: null, error: null }));
                },
                update(payload) {
                    calls.push({ table, op: 'update', payload });
                    const key = `${table}.update`;
                    return makeQuery(routes[key] ? routes[key] : () => ({ data: null, error: null }));
                },
                delete() {
                    calls.push({ table, op: 'delete' });
                    const key = `${table}.delete`;
                    return makeQuery(routes[key] ? routes[key] : () => ({ data: null, error: null }));
                }
            };
        }
    };
}

describe('Invoice File Status - perilaku dengan database', () => {

    describe('syncInvoiceFileStatus', () => {
        test('menghitung dari kolom path + invoice_files lalu menulis', async () => {
            const supabase = createMockSupabase({
                'invoice_file_list.select': () => ({
                    data: {
                        invoice_pdf_path: 'a.pdf',
                        bukti_bayar_path: 'b.pdf',
                        faktur_pajak_path: null,
                        keterangan: 'PPN',
                        files_uploaded_count: 0,
                        files_required_count: 0
                    },
                    error: null
                }),
                'invoice_files.select': () => ({ data: [{ file_type: 'invoice' }, { file_type: 'bukti_bayar' }], error: null }),
                'invoice_file_list.update': () => ({ data: null, error: null })
            });

            const res = await syncInvoiceFileStatus({ supabase, faktur: 'F1' });

            expect(res.count).toBe(2);
            expect(res.required).toBe(3);
            expect(res.updated).toBe(true);

            const upd = supabase.calls.find(c => c.table === 'invoice_file_list' && c.op === 'update');
            expect(upd.payload.files_uploaded_count).toBe(2);
            expect(upd.payload.files_required_count).toBe(3);
        });

        test('tidak menulis kalau nilai sudah benar', async () => {
            const supabase = createMockSupabase({
                'invoice_file_list.select': () => ({
                    data: {
                        invoice_pdf_path: 'a.pdf',
                        bukti_bayar_path: null,
                        faktur_pajak_path: null,
                        keterangan: 'NON',
                        files_uploaded_count: 1,
                        files_required_count: 2
                    },
                    error: null
                }),
                'invoice_files.select': () => ({ data: [], error: null })
            });

            const res = await syncInvoiceFileStatus({ supabase, faktur: 'F1' });

            expect(res.count).toBe(1);
            expect(res.required).toBe(2);
            expect(res.updated).toBe(false);
            expect(supabase.calls.find(c => c.op === 'update')).toBeUndefined();
        });

        test('record invoice_files tanpa kolom path ikut terhitung', async () => {
            const supabase = createMockSupabase({
                'invoice_file_list.select': () => ({
                    data: {
                        invoice_pdf_path: null,
                        bukti_bayar_path: null,
                        faktur_pajak_path: null,
                        keterangan: 'NON',
                        files_uploaded_count: 0,
                        files_required_count: 0
                    },
                    error: null
                }),
                'invoice_files.select': () => ({ data: [{ file_type: 'invoice' }], error: null }),
                'invoice_file_list.update': () => ({ data: null, error: null })
            });

            const res = await syncInvoiceFileStatus({ supabase, faktur: 'F1' });
            expect(res.count).toBe(1);
        });
    });

    describe('clearInvoiceFileRecord', () => {
        /** Mock STATEFUL: update & delete benar-benar mengubah data */
        function createStatefulMock(state) {
            const calls = [];
            const supabase = {
                calls,
                from(table) {
                    return {
                        select() {
                            const key = `${table}.select`;
                            return makeQuery((args) => {
                                if (key === 'invoice_file_list.select') return { data: state.invoice, error: null };
                                if (key === 'invoice_files.select') return { data: state.files, error: null };
                                return { data: [], error: null };
                            });
                        },
                        update(payload) {
                            calls.push({ table, op: 'update', payload });
                            const q = makeQuery(() => {
                                if (table === 'invoice_file_list' && state.invoice) {
                                    Object.assign(state.invoice, payload);
                                }
                                return { data: null, error: null };
                            });
                            return q;
                        },
                        delete() {
                            calls.push({ table, op: 'delete' });
                            const q = makeQuery((args) => {
                                if (table === 'invoice_files' && state.files) {
                                    const faktur = args.eq && args.eq.val;
                                    const type = args.eq2 && args.eq2.val;
                                    state.files = state.files.filter(f =>
                                        !(f.faktur === faktur && f.file_type === type)
                                    );
                                }
                                return { data: null, error: null };
                            });
                            return q;
                        }
                    };
                }
            };
            return supabase;
        }

        test('mengosongkan kolom path, hapus invoice_files, tulis ulang count', async () => {
            const state = {
                invoice: {
                    id: 1,
                    invoice_pdf_path: 'a.pdf',
                    bukti_bayar_path: 'b.pdf',
                    faktur_pajak_path: null,
                    keterangan: 'PPN',
                    files_uploaded_count: 2,
                    files_required_count: 3
                },
                files: [{ faktur: 'F1', file_type: 'invoice' }, { faktur: 'F1', file_type: 'bukti_bayar' }]
            };

            const supabase = createStatefulMock(state);

            const res = await clearInvoiceFileRecord({
                supabase, faktur: 'F1', fileType: 'invoice', deletedPath: 'a.pdf'
            });

            expect(res.cleared).toBe(true);
            expect(res.count).toBe(1);   // hanya bukti bayar yang tersisa

            const upd = supabase.calls.find(c => c.table === 'invoice_file_list' && c.op === 'update');
            expect(upd.payload.invoice_pdf_path).toBeNull();

            const del = supabase.calls.find(c => c.table === 'invoice_files' && c.op === 'delete');
            expect(del).toBeDefined();
            expect(state.files.length).toBe(1);
        });

        test('tidak menimpa kolom path bila path yang dihapus berbeda', async () => {
            const supabase = createMockSupabase({
                'invoice_file_list.select': () => ({
                    data: {
                        id: 1,
                        invoice_pdf_path: 'new.pdf',
                        bukti_bayar_path: null,
                        faktur_pajak_path: null,
                        keterangan: 'NON',
                        files_uploaded_count: 1,
                        files_required_count: 2
                    },
                    error: null
                }),
                'invoice_files.select': () => ({ data: [], error: null }),
                'invoice_file_list.update': () => ({ data: null, error: null }),
                'invoice_files.delete': () => ({ data: null, error: null })
            });

            const res = await clearInvoiceFileRecord({
                supabase, faktur: 'F1', fileType: 'invoice', deletedPath: 'old.pdf'
            });

            expect(res.cleared).toBe(false);
            const upd = supabase.calls.find(c => c.table === 'invoice_file_list' && c.op === 'update');
            // tidak boleh menulis null ke kolom path
            if (upd) {
                expect(upd.payload.invoice_pdf_path).not.toBeNull();
            }
        });
    });

    describe('findInvoicesByPath / findInvoicesByPrefix', () => {
        test('findInvoicesByPath mencocokkan kolom path', async () => {
            const supabase = createMockSupabase({
                'invoice_file_list.select': () => ({ data: [{ faktur: 'F1' }], error: null })
            });

            const res = await findInvoicesByPath({ supabase, filePath: 'a.pdf' });
            expect(res.length).toBe(3);   // 3 kolom path dicek
            expect(res.every(r => r.faktur === 'F1')).toBe(true);
        });

        test('findInvoicesByPrefix mengembalikan path-nya', async () => {
            const supabase = createMockSupabase({
                'invoice_file_list.select': () => ({
                    data: [{ faktur: 'F1', invoice_pdf_path: 'ARSIP/BEKASI/PPN/x.pdf' }],
                    error: null
                })
            });

            const res = await findInvoicesByPrefix({ supabase, prefix: 'ARSIP/BEKASI/PPN/' });
            expect(res.length).toBe(1);
            expect(res[0].path).toBe('ARSIP/BEKASI/PPN/x.pdf');
        });
    });

    describe('deleteInvoiceFileRow', () => {
        test('hapus record (faktur, file_type)', async () => {
            const supabase = createMockSupabase({
                'invoice_files.delete': () => ({ data: null, error: null })
            });

            const ok = await deleteInvoiceFileRow({ supabase, faktur: 'F1', fileType: 'invoice' });
            expect(ok).toBe(true);

            const del = supabase.calls.find(c => c.op === 'delete');
            expect(del.table).toBe('invoice_files');
        });
    });
});
