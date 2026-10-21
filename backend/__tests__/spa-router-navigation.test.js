/**
 * ============================================================
 * Unit Test: Logika navigasi SPA Router
 * ============================================================
 * Fokus: keputusan "SPA (hanya konten berubah)" vs "full page reload".
 * - Route di luar whitelist        -> full reload
 * - Route dengan kondisi sidebar berbeda -> full reload
 * - Route dalam whitelist & sidebar sama -> SPA (pushState)
 *
 * Router memakai DOM browser, jadi diuji dengan DOM fake minimal.
 * ============================================================
 */

const path = require('path');

// ---- DOM fake (minimal, cukup untuk router) ----
const listeners = {};
const sidebarEl = {
    _visible: true,
    querySelector(sel) {
        if (sel === '.sidebar-container') return this._visible ? {} : null;
        return null;
    }
};

const fakeDocument = {
    readyState: 'complete',
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    getElementById(id) { return id === 'sidebar' ? sidebarEl : null; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    body: { classList: { add() {}, remove() {} } },
    documentElement: { classList: { add() {}, remove() {} } }
};

const fakeWindow = {
    location: { pathname: '/dashboard', href: '' },
    history: {
        pushState(state, title, url) { fakeWindow.location.pathname = url; }
    },
    addEventListener() {},
    scrollTo() {},
    spaRouter: null
};

global.document = fakeDocument;
global.window = fakeWindow;
global.self = fakeWindow;
global.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };

// require setelah DOM fake siap (router auto-instansi saat load)
require(path.join(__dirname, '..', '..', 'js', 'spa-router.js'));

const router = fakeWindow.spaRouter;

describe('SPA Router - keputusan navigasi', () => {

    beforeEach(() => {
        sidebarEl._visible = true;
        fakeWindow.location.pathname = '/dashboard';
        fakeWindow.location.href = '';
        router.spaEnabled = true;
        router.loadPage = jest.fn();   // jangan panggil jaringan
    });

    test('router berhasil dibuat', () => {
        expect(router).toBeTruthy();
        expect(router.spaEnabled).toBe(true);
    });

    test('isValidRoute: hanya route whitelist', () => {
        expect(router.isValidRoute('/dashboard')).toBe(true);
        expect(router.isValidRoute('/toko')).toBe(true);
        expect(router.isValidRoute('/user')).toBe(true);
        expect(router.isValidRoute('/zona')).toBe(true);
        expect(router.isValidRoute('/notifikasi')).toBe(true);
        expect(router.isValidRoute('/whatsapp-setup')).toBe(true);

        // Di luar whitelist (harus full reload)
        expect(router.isValidRoute('/excel')).toBe(false);
        expect(router.isValidRoute('/invoice')).toBe(false);
        expect(router.isValidRoute('/logs')).toBe(false);
        expect(router.isValidRoute('/zona/dashboard')).toBe(false);  // admin zona (tanpa sidebar)
    });

    test('kill switch: spaEnabled=false -> semua route jadi full reload', () => {
        router.spaEnabled = false;
        expect(router.isValidRoute('/dashboard')).toBe(false);
        expect(router.isValidRoute('/toko')).toBe(false);
        router.spaEnabled = true;
    });

    test('route di luar whitelist -> full page reload (bukan SPA)', () => {
        router.navigate('/excel');
        expect(fakeWindow.location.href).toBe('/excel');
        expect(router.loadPage).not.toHaveBeenCalled();
    });

    test('route dalam whitelist & sidebar sama -> SPA (pushState, tanpa reload)', () => {
        router.navigate('/toko');
        expect(fakeWindow.location.pathname).toBe('/toko');
        expect(fakeWindow.location.href).toBe('');       // tidak full reload
        expect(router.loadPage).toHaveBeenCalledWith('/toko', true);
    });

    test('sidebar tidak terlihat di halaman sekarang -> full reload (sidebar harus hilang/muncul)', () => {
        sidebarEl._visible = false;   // mis. sedang di halaman tanpa sidebar
        router.navigate('/toko');
        expect(fakeWindow.location.href).toBe('/toko');
        expect(router.loadPage).not.toHaveBeenCalled();
    });

    test('hasVisibleSidebar membaca elemen sidebar yang sudah dirender', () => {
        sidebarEl._visible = true;
        expect(router.hasVisibleSidebar()).toBe(true);
        sidebarEl._visible = false;
        expect(router.hasVisibleSidebar()).toBe(false);
    });

    test('whitelist hanya berisi halaman dengan sidebar (konsistensi data)', () => {
        Object.entries(router.menuMapping).forEach(([p, cfg]) => {
            expect(cfg.hasSidebar).toBe(true);
            expect(cfg.url).toBe(p);
        });
    });
});
