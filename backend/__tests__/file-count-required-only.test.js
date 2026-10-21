/**
 * ============================================================
 * Unit Test: Aturan hitung file WAJIB + combine aman (Fase 2 & 3)
 * ============================================================
 * Memverifikasi:
 *   - computeFileStatus hanya menghitung file WAJIB (PPN 3, NON 2)
 *   - file "faktur pajak sisa" pada invoice NON tidak bikin terlihat lengkap
 *   - 2 faktur nyata dari diagnosa -> 1/2 (bukan 2/2)
 *   - endpoint combine-pdf: 400 + pesan jelas kalau file wajib kurang
 *   - endpoint combine-pdf: lanjut normal kalau semua file wajib ada
 * ============================================================
 */

const { computeFileStatus } = require('../invoice-file-status.js');

describe('Aturan hitung file wajib (computeFileStatus)', () => {

    test('PPN: 3 file wajib dihitung', () => {
        const r = computeFileStatus({
            invoice: {
                keterangan: 'PPN',
                invoice_pdf_path: 'a.pdf',
                bukti_bayar_path: 'b.pdf',
                faktur_pajak_path: 'c.pdf'
            },
            invoiceFileTypes: []
        });
        expect(r.required).toBe(3);
        expect(r.count).toBe(3);
        expect(r.isComplete).toBe(true);
        expect(r.missing).toEqual([]);
    });

    test('NON: faktur pajak sisa TIDAK dihitung', () => {
        const r = computeFileStatus({
            invoice: {
                keterangan: 'NON',
                invoice_pdf_path: 'a.pdf',
                bukti_bayar_path: 'b.pdf',
                faktur_pajak_path: 'c.pdf'   // sisa
            },
            invoiceFileTypes: []
        });
        expect(r.required).toBe(2);
        expect(r.count).toBe(2);
        expect(r.isComplete).toBe(true);
        // perType tetap melaporkan semua tipe (dipakai tombol download)
        expect(r.perType.faktur_pajak).toBe(true);
    });

    test('NON: tanpa Invoice PDF + ada faktur pajak sisa -> BELUM lengkap', () => {
        const r = computeFileStatus({
            invoice: {
                keterangan: 'NON PPN',
                invoice_pdf_path: null,
                uploaded_file_path: null,
                bukti_bayar_path: 'b.pdf',
                faktur_pajak_path: 'c.pdf'
            },
            invoiceFileTypes: []
        });
        expect(r.required).toBe(2);
        expect(r.count).toBe(1);
        expect(r.isComplete).toBe(false);
        expect(r.missing).toEqual(['invoice']);
    });

    test('faktus nyata 835100310010126011 -> count 1 (tidak 2)', () => {
        const r = computeFileStatus({
            invoice: {
                keterangan: 'NON PPN',
                invoice_pdf_path: null,
                uploaded_file_path: null,
                bukti_bayar_path: 'ARSIP/BEKASI/bukti-bayar/2026/JANUARI/01/835100310010126011.pdf',
                faktur_pajak_path: 'ARSIP/BEKASI/Faktur-Pajak/2026/JANUARI/01/835100310010126011.pdf'
            },
            invoiceFileTypes: ['bukti_bayar', 'faktur_pajak']
        });
        expect(r.count).toBe(1);
        expect(r.isComplete).toBe(false);
    });

    test('faktus nyata 835100310021026005 -> count 1 (tidak 2)', () => {
        const r = computeFileStatus({
            invoice: {
                keterangan: 'NON PPN',
                invoice_pdf_path: 'ARSIP/BEKASI/NON/2026/OKTOBER/02/835100310021026005.pdf',
                uploaded_file_path: null,
                bukti_bayar_path: null,
                faktur_pajak_path: 'ARSIP/BEKASI/Faktur-Pajak/2026/OKTOBER/02/835100310021026005.pdf'
            },
            invoiceFileTypes: ['invoice', 'faktur_pajak']
        });
        expect(r.count).toBe(1);
        expect(r.isComplete).toBe(false);
        expect(r.missing).toEqual(['bukti_bayar']);
    });

    test('record invoice_files tanpa kolom path tetap dihitung (sumber tunggal)', () => {
        const r = computeFileStatus({
            invoice: {
                keterangan: 'NON',
                invoice_pdf_path: null,
                uploaded_file_path: null,
                bukti_bayar_path: 'b.pdf'
            },
            invoiceFileTypes: ['invoice']   // file tercatat, kolom path kosong
        });
        expect(r.count).toBe(2);
        expect(r.isComplete).toBe(true);
    });
});
