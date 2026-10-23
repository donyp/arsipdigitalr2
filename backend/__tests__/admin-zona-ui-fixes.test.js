/**
 * Tes regresi UI Dashboard Admin Zona.
 *
 * Semua tes di sini hanya membaca source file (tanpa DB / tanpa server),
 * mengunci penyebab bug yang sudah diperbaiki:
 *  1. Pagination "0 - 0 dari 0" (variabel totalCount ter-shadow)
 *  2. Badge pengumuman "0" muncul sekejap (prioritas !important hilang)
 *  3. Blur backdrop popup pengumuman
 *  4. Menu download (ikon titik 3) delay karena await fetch sebelum popup
 *  5. Halaman buat tiket admin zona tidak full width (offset sidebar 16rem)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const baca = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('Dashboard Admin Zona - pagination', () => {
    const html = baca('dashboard-admin-zona.html');

    test('totalCount tidak di-shadow ulang di loadInvoices()', () => {
        const awal = html.indexOf('async function loadInvoices()');
        expect(awal).toBeGreaterThan(-1);

        const akhir = html.indexOf('function displaySortedInvoices', awal);
        const badan = html.slice(awal, akhir);

        expect(badan).toContain('totalCount = 0;');
        expect(badan).not.toMatch(/let\s+totalCount\s*=/);
    });

    test('deklarasi totalCount hanya satu (global)', () => {
        const jumlah = (html.match(/let\s+totalCount\s*=\s*0/g) || []).length;
        expect(jumlah).toBe(1);
    });

    test('updatePagination memakai totalCount global', () => {
        const awal = html.indexOf('function updatePagination()');
        const badan = html.slice(awal, awal + 700);
        expect(badan).toContain('dari ${totalCount} invoice');
        expect(badan).toContain("nextPageBtn').disabled = end >= totalCount");
    });
});

describe('Dashboard Admin Zona - badge pengumuman', () => {
    const annSrc = baca('js/announcement-notification.js');
    const zonaHtml = baca('dashboard-admin-zona.html');

    test('tidak menulis style.display tanpa prioritas (menghapus !important)', () => {
        expect(annSrc).not.toMatch(/badge\.style\.display\s*=\s*'(none|flex|inline-flex)'/);
    });

    test('menyembunyikan badge dengan setProperty important', () => {
        expect(annSrc).toContain("badge.style.setProperty('display', 'none', 'important')");
        expect(annSrc).toContain("badge.style.setProperty('display', 'inline-flex', 'important')");
    });

    test('memakai helper halaman bila tersedia', () => {
        expect(annSrc).toContain("typeof window.applyAnnouncementBadge === 'function'");
        expect(annSrc).toContain('window.applyAnnouncementBadge(this.unreadCount)');
    });

    test('badge tersembunyi sejak paint pertama', () => {
        expect(zonaHtml).toMatch(/id="announcementBadge"[^>]*hidden/);
        expect(zonaHtml).toContain('#announcementBadge[hidden]');
        expect(zonaHtml).toMatch(/#announcementBadge\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
    });

    test('helper applyAnnouncementBadge mengosongkan teks saat 0', () => {
        expect(zonaHtml).toContain('function applyAnnouncementBadge(count)');
        expect(zonaHtml).toContain("badge.textContent = ''");
        expect(zonaHtml).toContain("badge.style.setProperty('display', 'none', 'important')");
    });

    test('script announcement-notification di-bump versinya', () => {
        expect(zonaHtml).toContain('/js/announcement-notification.js?v=3');
    });
});

describe('Popup pengumuman - blur backdrop', () => {
    const annSrc = baca('js/announcement-notification.js');

    test('overlay daftar pengumuman memakai backdrop blur 6px', () => {
        const awal = annSrc.indexOf('.announcement-modal {');
        const badan = annSrc.slice(awal, annSrc.indexOf('.announcement-modal.hidden', awal));
        expect(badan).toMatch(/backdrop-filter:\s*blur\(6px\)/);
        expect(badan).toContain('-webkit-backdrop-filter');
    });

    test('overlay detail pengumuman juga blur 6px', () => {
        const awal = annSrc.indexOf('.announcement-detail-modal {');
        const badan = annSrc.slice(awal, annSrc.indexOf('.announcement-detail-modal.hidden', awal));
        expect(badan).toMatch(/backdrop-filter:\s*blur\(6px\)/);
    });
});

describe('Dashboard Admin Zona - menu download instan', () => {
    const html = baca('dashboard-admin-zona.html');

    const badanFungsi = () => {
        const awal = html.indexOf('async function showAdminZonaDownloadMenu');
        expect(awal).toBeGreaterThan(-1);
        const akhir = html.indexOf('async function downloadAdminZonaFile', awal);
        return html.slice(awal, akhir);
    };

    test('tidak ada await fetch check-faktur sebelum popup tampil', () => {
        expect(badanFungsi()).not.toMatch(/await\s+fetch\(`\/api\/invoice\/check-faktur/);
    });

    test('memakai cache lebih dulu (popup langsung tampil)', () => {
        const badan = badanFungsi();
        expect(badan).toContain('let invoice = findCachedInvoice(faktur)');
        expect(badan.indexOf('findCachedInvoice(faktur)')).toBeLessThan(badan.indexOf('Swal.fire({'));
    });

    test('sinkronisasi flag tetap jalan di latar belakang', () => {
        const badan = badanFungsi();
        expect(badan).toContain('fetchInvoiceFresh(faktur).then');
        expect(badan).toContain("cached.has_invoice = fresh.has_invoice");
        expect(badan).toContain("cached.has_bukti_bayar = fresh.has_bukti_bayar");
        expect(badan).toContain("cached.has_faktur_pajak = fresh.has_faktur_pajak");
    });

    test('invariant PPN 3 file / NON 2 file tidak berubah', () => {
        expect(badanFungsi()).toContain('const filesRequired = isPPN ? 3 : 2;');
    });
});

describe('Halaman buat tiket - admin zona full width', () => {
    const html = baca('support-create-ticket.html');

    test('wrapper diberi id agar offset bisa direset', () => {
        expect(html).toContain('id="ticketPageWrap"');
    });

    test('admin zona tidak memakai offset sidebar 16rem', () => {
        expect(html).toContain('data-customer="1"');
        expect(html).toContain('html[data-customer="1"] #ticketPageWrap');
        expect(html).toMatch(/html\[data-customer="1"\] #ticketPageWrap\s*\{[^}]*margin-left:\s*0\s*!important/);
        expect(html).toMatch(/html\[data-customer="1"\] #sidebar\s*\{[^}]*display:\s*none\s*!important/);
    });

    test('offset direset juga setelah initAuth (role pasti diketahui)', () => {
        expect(html).toMatch(/currentUser\.role === 'admin_zona'[\s\S]{0,400}getElementById\('ticketPageWrap'\)/);
    });
});
