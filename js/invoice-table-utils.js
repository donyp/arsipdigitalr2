/**
 * ============================================================
 * Invoice Table Utils - SATU sumber untuk badge status, filter, & sort
 * ============================================================
 * Dipakai oleh:
 *   - Browser: js/dashboard.js (window.InvoiceTableUtils)
 *   - Test   : backend/__tests__/invoice-table-utils.test.js
 *
 * Kenapa modul ini:
 *   Dulu dashboard.html punya salinan logika sendiri (hitung badge, filter
 *   status, sort) yang BERBEDA dari js/dashboard.js. Akibatnya setelah
 *   klik sort, badge x/3 bisa berubah, dan filter "Lunas/Belum Lunas"
 *   bisa hilang. Modul ini menghapus salinan itu.
 *
 * Aturan (sama dengan backend):
 *   - PPN  = 3 file wajib (invoice PDF + bukti bayar + faktur pajak)
 *   - NON = 2 file wajib (invoice PDF + bukti bayar)
 *   - "ada" = kolom path terisi (invoice_pdf_path / uploaded_file_path,
 *             bukti_bayar_path, faktur_pajak_path)
 *   - keterangan dibaca TANPA sensitif huruf besar-kecil
 *
 * Modul ini UMD: bisa di-load via <script> (browser) DAN require() (Node).
 * ============================================================
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.InvoiceTableUtils = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /**
     * Apakah invoice ini PPN? (case-insensitive - data lama bisa 'ppn')
     */
    function isPPNInvoice(inv) {
        return String((inv && inv.keterangan) || '').trim().toUpperCase() === 'PPN';
    }

    /**
     * Hitung status file satu invoice.
     * @returns {{required:number, uploaded:number, badgeCount:number,
     *            isComplete:boolean, hasInvoice:boolean,
     *            hasBuktiBayar:boolean, hasFakturPajak:boolean}}
     */
    function countFiles(inv) {
        const invoicePath = (inv && (inv.invoice_pdf_path || inv.uploaded_file_path)) || null;
        const buktiPath = (inv && inv.bukti_bayar_path) || null;
        const fakturPath = (inv && inv.faktur_pajak_path) || null;

        const required = isPPNInvoice(inv) ? 3 : 2;
        const uploaded = (invoicePath ? 1 : 0) + (buktiPath ? 1 : 0) + (fakturPath ? 1 : 0);

        return {
            required: required,
            uploaded: uploaded,
            // Badge tidak boleh lebih besar dari jumlah file wajib
            badgeCount: Math.min(uploaded, required),
            isComplete: uploaded >= required,
            hasInvoice: !!invoicePath,
            hasBuktiBayar: !!buktiPath,
            hasFakturPajak: !!fakturPath
        };
    }

    /**
     * Filter baris berdasarkan status kelengkapan ('Lunas' / 'Belum Lunas').
     */
    function filterByStatus(rows, status) {
        if (!status) return rows.slice();
        return rows.filter(function (inv) {
            const info = countFiles(inv);
            if (status === 'Lunas') return info.isComplete;
            if (status === 'Belum Lunas') return !info.isComplete;
            return true;
        });
    }

    /**
     * Bandingkan 2 invoice untuk pengurutan.
     * field: 'tanggal' | 'total' | 'status'
     *   - status  : diurutkan berdasarkan KELENGKAPAN file (3/3 lebih dulu)
     *   - tanggal : bandingkan sebagai tanggal (bukan string)
     *   - total   : bandingkan secara numerik
     */
    function compareInvoices(a, b, field, direction) {
        const desc = direction === 'desc';
        let result = 0;

        if (field === 'total') {
            const av = parseFloat(a && a.total_jumlah_jual) || 0;
            const bv = parseFloat(b && b.total_jumlah_jual) || 0;
            result = av - bv;
        } else if (field === 'status') {
            const ai = countFiles(a);
            const bi = countFiles(b);
            // Lengkap dulu (3/3), lalu 2, lalu 1, lalu 0
            result = ai.badgeCount - bi.badgeCount;
            if (result === 0) {
                // Tie-break: yang lebih lengkap (uploaded lebih banyak) di atas
                result = ai.uploaded - bi.uploaded;
            }
            if (result === 0) {
                const af = String(a && a.faktur || '');
                const bf = String(b && b.faktur || '');
                result = af < bf ? -1 : (af > bf ? 1 : 0);
            }
        } else {
            // default: tanggal
            const at = a && a.tanggal ? new Date(a.tanggal).getTime() : 0;
            const bt = b && b.tanggal ? new Date(b.tanggal).getTime() : 0;
            result = (isNaN(at) ? 0 : at) - (isNaN(bt) ? 0 : bt);
            if (result === 0) {
                const af = String(a && a.faktur || '');
                const bf = String(b && b.faktur || '');
                result = af < bf ? -1 : (af > bf ? 1 : 0);
            }
        }

        return desc ? -result : result;
    }

    /**
     * Urutkan salinan array (tidak mengubah array asal).
     */
    function sortInvoices(rows, field, direction) {
        return rows.slice().sort(function (a, b) {
            return compareInvoices(a, b, field, direction);
        });
    }

    /**
     * Ambil 1 halaman dari array (aman untuk halaman terakhir).
     */
    function paginate(rows, page, pageSize) {
        const size = pageSize > 0 ? pageSize : 20;
        const start = (page - 1) * size;
        if (start >= rows.length) return [];
        return rows.slice(start, start + size);
    }

    return {
        isPPNInvoice: isPPNInvoice,
        countFiles: countFiles,
        filterByStatus: filterByStatus,
        compareInvoices: compareInvoices,
        sortInvoices: sortInvoices,
        paginate: paginate
    };
});
