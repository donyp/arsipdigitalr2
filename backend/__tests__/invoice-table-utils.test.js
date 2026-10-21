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
});
