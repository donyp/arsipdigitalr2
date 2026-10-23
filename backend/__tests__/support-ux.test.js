/**
 * Tes util waktu + regresi UI Support Ticketing.
 *
 * Fokus:
 *  - Timestamp DB tanpa timezone diperlakukan sebagai UTC (bug "7 jam lalu")
 *  - Tangga format relatif: menit → jam → hari → minggu → bulan → tahun
 *  - Halaman detail moderator full screen (tanpa sidebar aplikasi)
 *  - Balasan moderator mendukung lampiran
 *  - Dashboard customer menampilkan "Belum dibalas"
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const baca = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const { parseDbDate, formatRelativeId } = require('../../js/time-utils');

describe('parseDbDate', () => {
    test('string tanpa timezone dianggap UTC', () => {
        const date = parseDbDate('2026-10-23T06:35:39.002866');
        expect(date.toISOString()).toBe('2026-10-23T06:35:39.002Z');
    });

    test('string dengan Z dipakai apa adanya', () => {
        const date = parseDbDate('2026-10-23T06:35:39Z');
        expect(date.toISOString()).toBe('2026-10-23T06:35:39.000Z');
    });

    test('nilai kosong / invalid menghasilkan null', () => {
        expect(parseDbDate(null)).toBeNull();
        expect(parseDbDate('')).toBeNull();
        expect(parseDbDate('bukan tanggal')).toBeNull();
    });
});

describe('formatRelativeId', () => {
    const sekarang = new Date('2026-10-23T13:35:39.000Z');
    const menitLalu = (menit) => new Date(sekarang.getTime() - menit * 60 * 1000);

    test('kurang dari 1 menit → Baru saja', () => {
        expect(formatRelativeId('2026-10-23T13:35:09.000Z', sekarang)).toBe('Baru saja');
    });

    test('menit', () => {
        expect(formatRelativeId(menitLalu(1).toISOString(), sekarang)).toBe('1 menit yang lalu');
        expect(formatRelativeId(menitLalu(59).toISOString(), sekarang)).toBe('59 menit yang lalu');
    });

    test('jam', () => {
        expect(formatRelativeId(menitLalu(60).toISOString(), sekarang)).toBe('1 jam yang lalu');
        expect(formatRelativeId(menitLalu(23 * 60).toISOString(), sekarang)).toBe('23 jam yang lalu');
    });

    test('hari', () => {
        expect(formatRelativeId(menitLalu(24 * 60).toISOString(), sekarang)).toBe('1 hari yang lalu');
        expect(formatRelativeId(menitLalu(6 * 24 * 60).toISOString(), sekarang)).toBe('6 hari yang lalu');
    });

    test('minggu (1-4 minggu)', () => {
        expect(formatRelativeId(menitLalu(7 * 24 * 60).toISOString(), sekarang)).toBe('1 minggu yang lalu');
        expect(formatRelativeId(menitLalu(27 * 24 * 60).toISOString(), sekarang)).toBe('3 minggu yang lalu');
    });

    test('bulan (1-12 bulan)', () => {
        expect(formatRelativeId(menitLalu(30 * 24 * 60).toISOString(), sekarang)).toBe('1 bulan yang lalu');
        expect(formatRelativeId(menitLalu(364 * 24 * 60).toISOString(), sekarang)).toBe('12 bulan yang lalu');
    });

    test('tahun', () => {
        expect(formatRelativeId(menitLalu(365 * 24 * 60).toISOString(), sekarang)).toBe('1 tahun yang lalu');
        expect(formatRelativeId(menitLalu(3 * 365 * 24 * 60).toISOString(), sekarang)).toBe('3 tahun yang lalu');
    });

    test('timestamp masa depan → Baru saja', () => {
        expect(formatRelativeId('2026-10-24T00:00:00Z', sekarang)).toBe('Baru saja');
    });

    test('regresi zona waktu: 06:35 UTC = 1 menit lalu pada 06:36 UTC', () => {
        // Kalau di-parse sebagai waktu lokal WIB (UTC+7), hasilnya akan meleset.
        expect(formatRelativeId('2026-10-23T06:35:39', new Date('2026-10-23T06:36:39Z')))
            .toBe('1 menit yang lalu');
    });
});

describe('Regresi UI Support Ticketing', () => {
    test('dashboard moderator memakai util waktu bersama', () => {
        const src = baca('js/support-moderator.js');
        expect(src).toContain('formatRelativeId(dateString)');
        expect(src).not.toContain('new Date(dateString)');
    });

    test('dashboard customer memakai last_reply_at & label Belum dibalas', () => {
        const src = baca('js/support-customer.js');
        expect(src).toContain('ticket.last_reply_at');
        expect(src).toContain('Belum dibalas');
        expect(src).toContain('ticket.closed_at');
    });

    test('detail moderator full screen tanpa sidebar aplikasi', () => {
        const html = baca('support-ticket-detail-moderator.html');
        expect(html).not.toContain('id="sidebar"');
        expect(html).not.toContain('/js/sidebar.js');
        expect(html).not.toContain('margin-left: 16rem');
        expect(html).toContain('href="/support/admin"');
    });

    test('detail moderator punya input lampiran pada balasan', () => {
        const html = baca('support-ticket-detail-moderator.html');
        expect(html).toContain('id="replyAttachmentInput"');
        expect(html).toContain('allow_empty');
        expect(html).toContain("/upload");
    });

    test('detail customer full width dan tanpa bayangan kartu berlebih', () => {
        const html = baca('support-ticket-detail.html');
        expect(html).toContain('max-width: none');
        expect(html).toContain('grid-template-columns: minmax(0, 1fr) 360px');
    });

    test('backend mengirim last_reply_at & mengecek otorisasi balasan', () => {
        const src = baca('backend/support-endpoints.js');
        expect(src).toContain('last_reply_at');
        expect(src).toContain("action: 'Add Ticket Message - Unauthorized'");
    });

    test('SPA router memastikan header dashboard dibuat ulang', () => {
        const src = baca('js/spa-router.js');
        expect(src).toContain("pageData.hasUnifiedHeader || path === '/dashboard'");
    });
});
