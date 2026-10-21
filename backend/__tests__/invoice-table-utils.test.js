/**
 * ============================================================
 * Test Invoice Table Utils (sumber tunggal badge, filter, sort)
 * ============================================================
 * Fokus: JAGA AGAR badge x/3, x/2 & tombol download tidak berubah
 * setelah refactor sort dashboard.
 * ============================================================
 */

const Table = require('../../js/invoice-table-utils.js');

const inv = (over = {}) => Object.assign({
    faktur: '835100310',
    tanggal: '2026-08-15',
    keterangan: 'PPN',
    total_jumlah_jual: 1000,
    invoice_pdf_path: 'ARSIP/a.pdf',
    bukti_bayar_path: null,
    faktur_pajak_path: null,
    uploaded_file_path: null
}, over);

describe('Invoice Table Utils', () => {

    describe('isPPNInvoice', () => {
        test('PPN (huruf besar)', () => {
            expect(Table.isPPNInvoice({ keterangan: 'PPN' })).toBe(true);
        });
        test('ppn (huruf kecil - data lama) -> tetap PPN', () => {
            expect(Table.isPPNInvoice({ keterangan: 'ppn' })).toBe(true);
        });
        test('PpN & spasi', () => {
            expect(Table.isPPNInvoice({ keterangan: ' Ppn ' })).toBe(true);
        });
        test('NON / kosong / null', () => {
            expect(Table.isPPNInvoice({ keterangan: 'NON' })).toBe(false);
            expect(Table.isPPNInvoice({ keterangan: '' })).toBe(false);
            expect(Table.isPPNInvoice({})).toBe(false);
        });
    });

    describe('countFiles', () => {
        test('PPN lengkap 3 file -> 3/3 lengkap', () => {
            const r = Table.countFiles(inv({
                bukti_bayar_path: 'b.pdf',
                faktur_pajak_path: 'c.pdf'
            }));
            expect(r.required).toBe(3);
            expect(r.uploaded).toBe(3);
            expect(r.badgeCount).toBe(3);
            expect(r.isComplete).toBe(true);
        });

        test('PPN 2 file -> 2/3 belum lengkap', () => {
            const r = Table.countFiles(inv({ bukti_bayar_path: 'b.pdf' }));
            expect(r.badgeCount).toBe(2);
            expect(r.isComplete).toBe(false);
        });

        test('NON 2 file -> 2/2 lengkap', () => {
            const r = Table.countFiles(inv({
                keterangan: 'NON',
                bukti_bayar_path: 'b.pdf'
            }));
            expect(r.required).toBe(2);
            expect(r.badgeCount).toBe(2);
            expect(r.isComplete).toBe(true);
        });

        test('NON dengan 3 path (faktur pajak leftover) -> badge tetap 2/2', () => {
            const r = Table.countFiles(inv({
                keterangan: 'NON',
                bukti_bayar_path: 'b.pdf',
                faktur_pajak_path: 'c.pdf'
            }));
            expect(r.badgeCount).toBe(2);
            expect(r.uploaded).toBe(3);
            expect(r.isComplete).toBe(true);
        });

        test('uploaded_file_path dipakai sebagai pengganti invoice_pdf_path', () => {
            const r = Table.countFiles(inv({
                invoice_pdf_path: null,
                uploaded_file_path: 'legacy.pdf'
            }));
            expect(r.hasInvoice).toBe(true);
            expect(r.uploaded).toBe(1);
        });

        test('keterangan lowercase ppn -> wajib 3 (konsisten dengan backend)', () => {
            const r = Table.countFiles(inv({ keterangan: 'ppn' }));
            expect(r.required).toBe(3);
        });

        test('tombol download: flag per tipe file (bukan gating PPN)', () => {
            const r = Table.countFiles(inv({
                keterangan: 'NON',
                bukti_bayar_path: 'b.pdf',
                faktur_pajak_path: 'c.pdf'
            }));
            expect(r.hasInvoice).toBe(true);
            expect(r.hasBuktiBayar).toBe(true);
            expect(r.hasFakturPajak).toBe(true);
        });

        test('tidak ada file -> 0/2 belum lengkap', () => {
            const r = Table.countFiles(inv({
                invoice_pdf_path: null,
                keterangan: 'NON'
            }));
            expect(r.badgeCount).toBe(0);
            expect(r.isComplete).toBe(false);
        });
    });

    describe('filterByStatus', () => {
        const rows = [
            inv({ faktur: '1', keterangan: 'NON', bukti_bayar_path: 'b.pdf' }),        // lengkap
            inv({ faktur: '2', keterangan: 'PPN', bukti_bayar_path: 'b.pdf' }),        // belum (butuh 3)
            inv({ faktur: '3', keterangan: 'PPN', bukti_bayar_path: 'b.pdf', faktur_pajak_path: 'c.pdf' }) // lengkap
        ];

        test('tanpa status -> semua baris', () => {
            expect(Table.filterByStatus(rows, '').length).toBe(3);
        });

        test('Lunas -> hanya yang lengkap', () => {
            const r = Table.filterByStatus(rows, 'Lunas');
            expect(r.map(x => x.faktur)).toEqual(['1', '3']);
        });

        test('Belum Lunas -> hanya yang belum lengkap', () => {
            const r = Table.filterByStatus(rows, 'Belum Lunas');
            expect(r.map(x => x.faktur)).toEqual(['2']);
        });

        test('tidak mengubah array asal', () => {
            const before = rows.length;
            Table.filterByStatus(rows, 'Lunas');
            expect(rows.length).toBe(before);
        });
    });

    describe('sortInvoices', () => {
        const rows = [
            inv({ faktur: '3', tanggal: '2026-08-03', total_jumlah_jual: 300 }),
            inv({ faktur: '1', tanggal: '2026-08-01', total_jumlah_jual: 100 }),
            inv({ faktur: '2', tanggal: '2026-08-02', total_jumlah_jual: 200 })
        ];

        test('tanggal asc', () => {
            const r = Table.sortInvoices(rows, 'tanggal', 'asc');
            expect(r.map(x => x.faktur)).toEqual(['1', '2', '3']);
        });

        test('tanggal desc', () => {
            const r = Table.sortInvoices(rows, 'tanggal', 'desc');
            expect(r.map(x => x.faktur)).toEqual(['3', '2', '1']);
        });

        test('total asc & desc (numerik, bukan string)', () => {
            expect(Table.sortInvoices(rows, 'total', 'asc').map(x => x.faktur)).toEqual(['1', '2', '3']);
            expect(Table.sortInvoices(rows, 'total', 'desc').map(x => x.faktur)).toEqual(['3', '2', '1']);
        });

        test('array asal tidak berubah', () => {
            const copy = rows.map(x => x.faktur);
            Table.sortInvoices(rows, 'tanggal', 'desc');
            expect(rows.map(x => x.faktur)).toEqual(copy);
        });

        test('status -> berdasarkan kelengkapan file', () => {
            const data = [
                inv({ faktur: 'kurang', keterangan: 'PPN', bukti_bayar_path: 'b.pdf' }),           // 2/3
                inv({ faktur: 'lengkap', keterangan: 'PPN', bukti_bayar_path: 'b.pdf', faktur_pajak_path: 'c.pdf' }), // 3/3
                inv({ faktur: 'nonlengkap', keterangan: 'NON' })                                     // 1/2
            ];
            const desc = Table.sortInvoices(data, 'status', 'desc');
            expect(desc[0].faktur).toBe('lengkap');
            const asc = Table.sortInvoices(data, 'status', 'asc');
            expect(asc[asc.length - 1].faktur).toBe('lengkap');
        });

        // ============================================================
        // REGRESI: 2/2 (LENGKAP) tidak boleh tercampur dengan 2/3 (belum).
        // Urutan yang diharapkan:
        //   lengkap dulu : 3/3 -> 2/2 -> 2/3 -> 1/2 -> 1/3 -> 0/2 -> 0/3
        //   sebaliknya    : 0/3 -> 0/2 -> 1/3 -> 1/2 -> 2/3 -> 2/2 -> 3/3
        // ============================================================
        describe('urutan sort status', () => {
            const mix = [
                { faktur: 'a-2/3', keterangan: 'PPN', invoice_pdf_path: 'x.pdf', bukti_bayar_path: 'y.pdf' },
                { faktur: 'b-2/2', keterangan: 'NON', invoice_pdf_path: 'x.pdf', bukti_bayar_path: 'y.pdf' },
                { faktur: 'c-3/3', keterangan: 'PPN', invoice_pdf_path: 'x.pdf', bukti_bayar_path: 'y.pdf', faktur_pajak_path: 'z.pdf' },
                { faktur: 'd-1/2', keterangan: 'NON', invoice_pdf_path: 'x.pdf' },
                { faktur: 'e-1/3', keterangan: 'PPN', invoice_pdf_path: 'x.pdf' },
                { faktur: 'f-0/2', keterangan: 'NON' },
                { faktur: 'g-0/3', keterangan: 'PPN' }
            ];

            test('arah "lengkap dulu": 3/3, 2/2, 2/3, 1/2, 1/3, 0/2, 0/3', () => {
                const r = Table.sortInvoices(mix, 'status', 'desc');
                expect(r.map(x => x.faktur)).toEqual([
                    'c-3/3', 'b-2/2', 'a-2/3', 'd-1/2', 'e-1/3', 'f-0/2', 'g-0/3'
                ]);
            });

            test('arah sebaliknya: 0/3, 0/2, 1/3, 1/2, 2/3, 2/2, 3/3', () => {
                const r = Table.sortInvoices(mix, 'status', 'asc');
                expect(r.map(x => x.faktur)).toEqual([
                    'g-0/3', 'f-0/2', 'e-1/3', 'd-1/2', 'a-2/3', 'b-2/2', 'c-3/3'
                ]);
            });

            test('arah berlawanan benar-benar kebalikan (reverse)', () => {
                const asc = Table.sortInvoices(mix, 'status', 'asc').map(x => x.faktur);
                const desc = Table.sortInvoices(mix, 'status', 'desc').map(x => x.faktur);
                expect(desc).toEqual(asc.slice().reverse());
            });

            test('semua invoice lengkap berada di satu blok (tidak tercampur)', () => {
                const desc = Table.sortInvoices(mix, 'status', 'desc');
                const lengkapIdx = desc.map((x, i) => Table.countFiles(x).isComplete ? i : -1).filter(i => i >= 0);
                const belumIdx = desc.map((x, i) => Table.countFiles(x).isComplete ? -1 : i).filter(i => i >= 0);
                // semua lengkap harus di indeks lebih kecil dari semua yang belum
                expect(Math.max(...lengkapIdx)).toBeLessThan(Math.min(...belumIdx));
            });
        });
    });

    describe('paginate', () => {
        const rows = Array.from({ length: 45 }, (_, i) => ({ faktur: String(i) }));

        test('halaman 1 & 2 benar', () => {
            expect(Table.paginate(rows, 1, 20).length).toBe(20);
            expect(Table.paginate(rows, 2, 20).length).toBe(20);
            expect(Table.paginate(rows, 3, 20).length).toBe(5);
        });

        test('halaman di luar jangkauan -> array kosong (tidak error)', () => {
            expect(Table.paginate(rows, 99, 20)).toEqual([]);
        });
    });

    // ============================================================
    // REGRESI: badge status & tombol download TIDAK boleh berubah
    // setelah user klik sort. Ini yang dulu rusak (ada copy-paste
    // logika sendiri di dashboard.html).
    // ============================================================
    describe('konsistensi badge & tombol download setelah sort', () => {
        const dataset = [
            inv({ faktur: 'A', keterangan: 'PPN', bukti_bayar_path: 'b1.pdf', total_jumlah_jual: 500 }),      // 2/3
            inv({ faktur: 'B', keterangan: 'NON', bukti_bayar_path: 'b2.pdf', total_jumlah_jual: 300 }),      // 2/2
            inv({ faktur: 'C', keterangan: 'ppn', bukti_bayar_path: 'b3.pdf', faktur_pajak_path: 'c3.pdf', total_jumlah_jual: 700 }), // 3/3
            inv({ faktur: 'D', keterangan: 'PPN', total_jumlah_jual: 100 }),                                  // 1/3
            inv({ faktur: 'E', keterangan: 'NON', invoice_pdf_path: null, uploaded_file_path: 'e.pdf', total_jumlah_jual: 900 }), // 1/2
            inv({ faktur: 'F', keterangan: 'NON', bukti_bayar_path: 'b6.pdf', faktur_pajak_path: 'c6.pdf', total_jumlah_jual: 200 })  // 2/2
        ];

        function snapshot(rows) {
            const map = {};
            rows.forEach(r => {
                const info = Table.countFiles(r);
                map[r.faktur] = {
                    badge: `${info.badgeCount}/${info.required}`,
                    lengkap: info.isComplete,
                    tombol: [info.hasInvoice && 'invoice', info.hasBuktiBayar && 'bukti', info.hasFakturPajak && 'pajak']
                        .filter(Boolean).join(',')
                };
            });
            return map;
        }

        test('badge, status lengkap & tombol download identik sebelum & sesudah sort', () => {
            const sebelum = snapshot(dataset);

            ['tanggal', 'total', 'status'].forEach(field => {
                ['asc', 'desc'].forEach(dir => {
                    const hasil = Table.sortInvoices(dataset, field, dir);
                    const sesudah = snapshot(hasil);
                    expect(sesudah).toEqual(sebelum);
                });
            });
        });

        test('urutan baris benar-benar berubah saat sort (bukan sekadar dibalik)', () => {
            const asc = Table.sortInvoices(dataset, 'total', 'asc').map(r => r.faktur);
            const desc = Table.sortInvoices(dataset, 'total', 'desc').map(r => r.faktur);
            expect(asc).not.toEqual(desc);
            expect(asc.length).toBe(dataset.length);
        });

        test('filter status + sort tetap konsisten (tidak ada barit hilang/duplikat)', () => {
            const belum = Table.filterByStatus(dataset, 'Belum Lunas');
            const sorted = Table.sortInvoices(belum, 'tanggal', 'desc');
            expect(sorted.length).toBe(belum.length);
            expect(new Set(sorted.map(r => r.faktur)).size).toBe(belum.length);
            sorted.forEach(r => expect(Table.countFiles(r).isComplete).toBe(false));
        });
    });

    // ============================================================
    // REGRESI: server (Supabase) membatasi jumlah baris per request
    // ("max rows" = 500). Kalau kode menganggap semua baris sudah
    // terambil, total invoice jadi salah (contoh: 865 -> 500).
    // ============================================================
    describe('fetchAllRows', () => {
        test('server memotong 500 baris -> data diambil bertahap sampai habis', async () => {
            const total = 865;
            const CAP = 500;
            const pages = [];

            const fetchPage = async (offset, limit) => {
                pages.push({ offset, limit });
                const start = Math.min(offset, total);
                const end = Math.min(start + CAP, total);   // server potong di 500
                const rows = [];
                for (let i = start; i < end; i++) rows.push({ faktur: 'F' + i });
                return rows;
            };

            const rows = await Table.fetchAllRows(fetchPage, total);

            expect(rows.length).toBe(total);          // SEMUA baris didapat
            expect(rows[0].faktur).toBe('F0');
            expect(rows[rows.length - 1].faktur).toBe('F864');
            expect(pages.length).toBe(2);              // 500 + 365
        });

        test('server tidak memotong -> cukup 1 request', async () => {
            const total = 120;
            let calls = 0;
            const fetchPage = async (offset, limit) => {
                calls++;
                const rows = [];
                for (let i = offset; i < Math.min(offset + limit, total); i++) rows.push({ faktur: 'F' + i });
                return rows;
            };
            const rows = await Table.fetchAllRows(fetchPage, total);
            expect(rows.length).toBe(total);
            expect(calls).toBe(1);
        });

        test('total 0 -> tidak ada request', async () => {
            let calls = 0;
            const rows = await Table.fetchAllRows(async () => { calls++; return []; }, 0);
            expect(rows).toEqual([]);
            expect(calls).toBe(0);
        });

        test('server mengembalikan data kosong di tengah -> berhenti (tidak loop)', async () => {
            let calls = 0;
            const fetchPage = async () => { calls++; return []; };
            const rows = await Table.fetchAllRows(fetchPage, 1000);
            expect(rows).toEqual([]);
            expect(calls).toBe(1);
        });

        test('batas jumlah request dipatuhi', async () => {
            const fetchPage = async () => [{ faktur: 'x' }];
            const rows = await Table.fetchAllRows(fetchPage, 1000, { maxRequests: 3 });
            expect(rows.length).toBeLessThanOrEqual(3);
        });
    });
});
