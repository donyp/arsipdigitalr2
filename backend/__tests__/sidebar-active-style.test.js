/**
 * ============================================================
 * Unit Test: Style item menu aktif (regresi "2 highlight menu aktif")
 * ============================================================
 * Dulu saat pindah menu (SPA) hanya class 'active' yang di-toggle,
 * sedangkan highlight (background/warna/border) berasal dari inline
 * style saat render awal -> item lama tetap terlihat aktif.
 * ============================================================
 */

// DOM fake minimal supaya js/sidebar.js bisa dimuat
const sidebarListeners = {};
global.document = {
    readyState: 'complete',
    addEventListener(type, fn) { (sidebarListeners[type] = sidebarListeners[type] || []).push(fn); },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; },
    head: { appendChild() {} },
    body: { appendChild() {}, classList: { add() {}, remove() {}, contains() { return false; } } },
    documentElement: { classList: { add() {}, remove() {} } }
};
global.window = {
    location: { pathname: '/dashboard', href: '' },
    addEventListener() {},
    localStorage: { getItem: () => 'false', setItem() {} },
    setTimeout: () => {}
};
global.self = global.window;
global.localStorage = global.window.localStorage;

require('../../js/sidebar.js');

const internals = global.window.SidebarInternals;

describe('Sidebar - style item aktif', () => {

    test('hook testing tersedia', () => {
        expect(internals).toBeTruthy();
        expect(typeof internals.applyItemActiveStyle).toBe('function');
        expect(typeof internals.isMenuItemActive).toBe('function');
    });

    test('item aktif: background + warna + border + font-weight sesuai', () => {
        const item = { classList: { add() {}, remove() {} }, style: {} };
        internals.applyItemActiveStyle(item, true, null, false);
        expect(item.style.backgroundColor).not.toBe('transparent');
        expect(item.style.borderLeft).toContain('3px solid');
        expect(item.style.fontWeight).toBe(600);
    });

    test('item TIDAK aktif: background transparan & border transparan', () => {
        const item = { classList: { add() {}, remove() {} }, style: {} };
        internals.applyItemActiveStyle(item, false, null, false);
        expect(item.style.backgroundColor).toBe('transparent');
        expect(item.style.borderLeft).toContain('transparent');
        expect(item.style.fontWeight).toBe(500);
    });

    test('class active di-toggle sesuai status', () => {
        const state = { active: false };
        const item = {
            classList: {
                add(c) { if (c === 'active') state.active = true; },
                remove(c) { if (c === 'active') state.active = false; },
                contains() { return false; }
            },
            style: {}
        };
        internals.applyItemActiveStyle(item, true, null, false);
        expect(state.active).toBe(true);
        internals.applyItemActiveStyle(item, false, null, false);
        expect(state.active).toBe(false);
    });

    test('isMenuItemActive: path /notifikasi hanya cocok dengan /notifikasi', () => {
        global.window.location.pathname = '/notifikasi';
        expect(internals.isMenuItemActive('/notifikasi')).toBe(true);
        expect(internals.isMenuItemActive('/dashboard')).toBe(false);
        expect(internals.isMenuItemActive('/user')).toBe(false);
    });

    test('isMenuItemActive: path /user tidak cocok dengan /dashboard', () => {
        global.window.location.pathname = '/user';
        expect(internals.isMenuItemActive('/user')).toBe(true);
        expect(internals.isMenuItemActive('/dashboard')).toBe(false);
    });

    // ============================================================
    // REGRESI: highlight menu aktif harus PINDAH SEGERA saat klik,
    // padahal URL baru berubah setelah konten tertukar. Karena itu
    // path tujuan bisa diberikan langsung (pathOverride).
    // ============================================================
    test('isMenuItemActive: pathOverride dipakai untuk target navigasi', () => {
        global.window.location.pathname = '/dashboard';
        // target navigasi = /toko (URL belum berubah)
        expect(internals.isMenuItemActive('/toko', '/toko')).toBe(true);
        expect(internals.isMenuItemActive('/dashboard', '/toko')).toBe(false);
        // tanpa override, ikut pathname saat ini
        expect(internals.isMenuItemActive('/dashboard')).toBe(true);
    });

    // ============================================================
    // REGRESI: saat navigasi SPA, URL masih path LAMA -> highlight
    // sempat balik ke menu lama (glitch). Router menyimpan path tujuan
    // di window.__spaTargetPath -> itu yang jadi acuan.
    // ============================================================
    test('acuan path aktif memakai __spaTargetPath (bukan pathname lama)', () => {
        global.window.location.pathname = '/dashboard';
        global.window.__spaTargetPath = '/notifikasi';

        // Semua pemanggil (router, init halaman, dropdown) ikut acuan yang sama
        expect(internals.isMenuItemActive('/notifikasi')).toBe(true);
        expect(internals.isMenuItemActive('/dashboard')).toBe(false);

        // Setelah navigasi selesai, target dibersihkan -> kembali ke pathname
        global.window.__spaTargetPath = null;
        expect(internals.isMenuItemActive('/dashboard')).toBe(true);
        expect(internals.isMenuItemActive('/notifikasi')).toBe(false);
    });
});
