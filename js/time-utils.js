/**
 * Util waktu bersama untuk halaman Support Ticketing.
 *
 * Supabase menyimpan timestamp dalam UTC, tetapi sering dikirim tanpa
 * penanda timezone (contoh: "2026-10-23T06:35:39.002866"). Jika di-parse
 * langsung dengan `new Date()`, JavaScript menganggapnya waktu LOKAL
 * sehingga di WIB (UTC+7) tampil meleset 7 jam.
 *
 * `parseDbDate()` menormalkan nilai tanpa timezone menjadi UTC, dan
 * `formatRelativeId()` menampilkan jarak waktu dalam bahasa Indonesia.
 */

(function (root, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.parseDbDate = api.parseDbDate;
        root.formatRelativeId = api.formatRelativeId;
        root.getRelativeTimeId = api.formatRelativeId;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const POLA_TIMEZONE = /(?:z|[+-]\d{2}:?\d{2})$/i;

    /**
     * Parse nilai tanggal dari database sebagai UTC bila tidak ada timezone.
     * @param {string|number|Date|null|undefined} value
     * @returns {Date|null}
     */
    function parseDbDate(value) {
        if (value === null || value === undefined || value === '') return null;
        if (value instanceof Date) {
            return Number.isNaN(value.getTime()) ? null : value;
        }

        if (typeof value === 'number') {
            const dariAngka = new Date(value);
            return Number.isNaN(dariAngka.getTime()) ? null : dariAngka;
        }

        const teks = String(value).trim();
        if (!teks) return null;

        const adaTimezone = POLA_TIMEZONE.test(teks);
        const normal = adaTimezone ? teks : teks.replace(' ', 'T') + 'Z';
        const tanggal = new Date(normal);

        return Number.isNaN(tanggal.getTime()) ? null : tanggal;
    }

    /**
     * Format jarak waktu dalam bahasa Indonesia.
     * Tangga: baru saja, menit, jam, hari, minggu, bulan, tahun.
     * @param {string|number|Date|null|undefined} value
     * @param {Date} [sekarang]
     * @returns {string}
     */
    function formatRelativeId(value, sekarang) {
        const tanggal = parseDbDate(value);
        if (!tanggal) return '-';

        const acuan = sekarang instanceof Date && !Number.isNaN(sekarang.getTime())
            ? sekarang
            : new Date();

        const selisihMs = acuan.getTime() - tanggal.getTime();
        if (!Number.isFinite(selisihMs) || selisihMs < 0) return 'Baru saja';

        const detik = Math.floor(selisihMs / 1000);
        if (detik < 60) return 'Baru saja';

        const menit = Math.floor(detik / 60);
        if (menit < 60) return `${menit} menit yang lalu`;

        const jam = Math.floor(menit / 60);
        if (jam < 24) return `${jam} jam yang lalu`;

        const hari = Math.floor(jam / 24);
        if (hari < 7) return `${hari} hari yang lalu`;

        if (hari < 28) {
            return `${Math.max(1, Math.floor(hari / 7))} minggu yang lalu`;
        }

        if (hari < 365) {
            return `${Math.max(1, Math.floor(hari / 30))} bulan yang lalu`;
        }

        return `${Math.max(1, Math.floor(hari / 365))} tahun yang lalu`;
    }

    return { parseDbDate, formatRelativeId };
});
