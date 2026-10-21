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
     * Tipe file yang WAJIB ada untuk sebuah invoice.
     * PPN  -> invoice PDF + bukti bayar + faktur pajak (3)
     * NON -> invoice PDF + bukti bayar (2)
     */
    function requiredFileTypes(inv) {
        return isPPNInvoice(inv)
            ? ['invoice', 'bukti_bayar', 'faktur_pajak']
            : ['invoice', 'bukti_bayar'];
    }

    /**
     * Hitung status file satu invoice.
     *
     * PENTING: yang dihitung HANYA file yang wajib untuk tipe invoice ini.
     * Invoice NON yang punya "faktur pajak sisa" tidak boleh dihitung sebagai
     * file lengkap - kalau tidak, invoice tanpa Invoice PDF tetap terlihat
     * "lengkap" (2/2) dan tombol Combine jadi salah.
     *
     * @returns {{required:number, uploaded:number, badgeCount:number,
     *            isComplete:boolean, hasInvoice:boolean,
     *            hasBuktiBayar:boolean, hasFakturPajak:boolean,
     *            missing:string[], extraTypes:string[]}}
     */
    function countFiles(inv) {
        const invoicePath = (inv && (inv.invoice_pdf_path || inv.uploaded_file_path)) || null;
        const buktiPath = (inv && inv.bukti_bayar_path) || null;
        const fakturPath = (inv && inv.faktur_pajak_path) || null;

        const requiredTypes = requiredFileTypes(inv);
        const required = requiredTypes.length;

        const present = {
            invoice: !!invoicePath,
            bukti_bayar: !!buktiPath,
            faktur_pajak: !!fakturPath
        };

        // Hanya file wajib yang dihitung
        const missing = requiredTypes.filter(t => !present[t]);
        const uploaded = requiredTypes.length - missing.length;

        // File ada tapi tidak wajib untuk tipe invoice ini (mis. faktur pajak
        // sisa pada invoice NON) - tidak dihitung, tombolnya juga disembunyikan
        const extraTypes = ['invoice', 'bukti_bayar', 'faktur_pajak']
            .filter(t => present[t] && requiredTypes.indexOf(t) === -1);

        return {
            required: required,
            uploaded: uploaded,
            badgeCount: Math.min(uploaded, required),
            isComplete: uploaded >= required,
            hasInvoice: present.invoice,
            hasBuktiBayar: present.bukti_bayar,
            hasFakturPajak: present.faktur_pajak,
            missing: missing,
            extraTypes: extraTypes
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
            // ============================================================
            // Urutan kelengkapan file (penting: 2/2 LENGKAP harus tidak
            // tercampur dengan 2/3 yang BELUM lengkap)
            //
            // Arah "lengkap dulu" (desc):
            //   3/3 -> 2/2 -> 2/3 -> 1/2 -> 1/3 -> 0/2 -> 0/3
            // Arah sebaliknya (asc) = kebalikannya:
            //   0/3 -> 0/2 -> 1/3 -> 1/2 -> 2/3 -> 2/2 -> 3/3
            // ============================================================
            if (ai.isComplete !== bi.isComplete) {
                // Belum lengkap di atas (untuk asc); dibalik otomatis di desc
                result = ai.isComplete ? 1 : -1;
            } else if (ai.uploaded !== bi.uploaded) {
                // Lebih sedikit file di atas (untuk asc)
                result = ai.uploaded - bi.uploaded;
            } else if (ai.required !== bi.required) {
                // Jumlah file wajib lebih banyak di atas (untuk asc)
                result = bi.required - ai.required;
            } else {
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

    /**
     * Ambil SELURUH baris dari endpoint yang membatasi jumlah baris
     * per request (mis. "max rows" di Supabase = 500 baris).
     *
     * fetchPage(offset, limit) harus mengembalikan array baris.
     *-totalCount = jumlah baris sebenarnya (dari count endpoint)
     * -jumlah baris yang benar-benar diterima server dipakai untuk
     *  menentukan ukuran request berikutnya (jadi aman walau cap-nya 500
     *  atau angka lain)
     * -jika data tidak bisa diambil semua, hasil yang dikembalikan
     *  lebih pendek - pemanggil bisa memutuskan fallback ke mode server
     */
    async function fetchAllRows(fetchPage, totalCount, options) {
        const opts = options || {};
        const maxRequests = opts.maxRequests || 20;
        const firstLimit = opts.firstLimit || 1000;
        const total = Number(totalCount) || 0;

        const rows = [];
        if (total <= 0) return rows;

        let offset = 0;
        let chunkSize = 0;
        let requests = 0;

        while (offset < total && requests < maxRequests) {
            const limit = chunkSize || Math.min(firstLimit, total);
            const data = await fetchPage(offset, limit);
            requests++;

            if (!data || !data.length) break;

            for (let i = 0; i < data.length; i++) rows.push(data[i]);
            offset += data.length;

            // Server memotong hasil (cap) -> pakai ukuran baris yang sama
            // untuk request berikutnya agar tidak ada baris yang terlewat
            if (data.length < limit) {
                chunkSize = data.length;
            }

            if (rows.length >= total) break;
        }

        return rows;
    }

    return {
        isPPNInvoice: isPPNInvoice,
        requiredFileTypes: requiredFileTypes,
        countFiles: countFiles,
        filterByStatus: filterByStatus,
        compareInvoices: compareInvoices,
        sortInvoices: sortInvoices,
        paginate: paginate,
        fetchAllRows: fetchAllRows
    };
});
