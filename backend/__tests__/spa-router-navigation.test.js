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

        // Halaman upload & alat sekarang ikut SPA (tidak full reload)
        expect(router.isValidRoute('/excel')).toBe(true);
        expect(router.isValidRoute('/invoice')).toBe(true);
        expect(router.isValidRoute('/buktibayar')).toBe(true);
        expect(router.isValidRoute('/fakturpajak')).toBe(true);
        expect(router.isValidRoute('/renamefaktur')).toBe(true);
        expect(router.isValidRoute('/logs')).toBe(true);
        expect(router.isValidRoute('/backup')).toBe(true);
        expect(router.isValidRoute('/kendaraan')).toBe(true);
        expect(router.isValidRoute('/penyimpanan')).toBe(true);
        expect(router.isValidRoute('/support/admin')).toBe(true);

        // Di luar whitelist (harus full reload)
        expect(router.isValidRoute('/monitoring.html')).toBe(false);
        expect(router.isValidRoute('/upload')).toBe(false);
        expect(router.isValidRoute('/zona/dashboard')).toBe(false);  // admin zona (tanpa sidebar)
    });

    test('kill switch: spaEnabled=false -> semua route jadi full reload', () => {
        router.spaEnabled = false;
        expect(router.isValidRoute('/dashboard')).toBe(false);
        expect(router.isValidRoute('/toko')).toBe(false);
        router.spaEnabled = true;
    });

    test('route di luar whitelist -> full page reload (bukan SPA)', () => {
        router.navigate('/monitoring.html');
        expect(fakeWindow.location.href).toBe('/monitoring.html');
        expect(router.loadPage).not.toHaveBeenCalled();
    });

    test('route dalam whitelist & sidebar sama -> SPA (tanpa reload)', () => {
        router.navigate('/toko');
        // URL baru berubah setelah konten tertukar (lihat loadPage)
        expect(fakeWindow.location.href).toBe('');       // tidak full reload
        expect(router.loadPage).toHaveBeenCalledWith('/toko', true);
    });

    test('sidebar berbeda kondisi -> disembunyikan/ditampilkan, BUKAN full reload', () => {
        sidebarEl._visible = false;   // mis. sedang di halaman tanpa sidebar
        const sidebar = { style: {} };
        const origGet = global.document.getElementById;
        global.document.getElementById = (id) => (id === 'sidebar' ? sidebar : null);

        router.navigate('/toko');
        // tidak full reload lagi -> transisi tetap instan
        expect(fakeWindow.location.href).toBe('');
        expect(router.loadPage).toHaveBeenCalledWith('/toko', true);
        expect(sidebar.style.display).toBe('block');   // sidebar ditampilkan

        global.document.getElementById = origGet;
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

    // ============================================================
    // REGRESI: URL dulu berubah dulu (pushState) lalu loadPage bisa
    // BATAL (isLoading) -> "URL berubah tapi halaman tidak" -> user
    // harus klik dua kali.
    // ============================================================
    test('navigate() tidak mengubah URL sebelum konten tertukar', () => {
        router.loadPage = jest.fn();
        router.navigate('/toko');
        expect(fakeWindow.location.pathname).toBe('/dashboard'); // URL BELUM berubah
        expect(router.loadPage).toHaveBeenCalledWith('/toko', true);
    });

    test('navigasi saat halaman sedang dimuat -> diantrikan, URL tidak berubah', () => {
        router.loadPage = jest.fn();
        router.isLoading = true;
        router.navigate('/zona');
        expect(router.pendingPath).toBe('/zona');
        expect(fakeWindow.location.pathname).toBe('/dashboard');
        router.isLoading = false;
        router.pendingPath = null;
    });

    // ============================================================
    // REGRESI: server bisa me-redirect /logs -> /logs/ (karena ada
    // folder 'logs' di root) -> path dengan trailing slash harus
    // tetap dikenali sebagai route yang sama.
    // ============================================================
    test('normalizePath: trailing slash dianggap route yang sama', () => {
        expect(router.normalizePath('/logs/')).toBe('/logs');
        expect(router.normalizePath('/logs')).toBe('/logs');
        expect(router.normalizePath('/')).toBe('/');
    });

    test('route dengan trailing slash tetap valid (isValidRoute)', () => {
        router.loadPage = jest.fn();
        expect(router.isValidRoute('/logs/')).toBe(true);
        expect(router.isValidRoute('/logs')).toBe(true);
    });

    test('setSidebarVisibility: menyembunyikan & menampilkan sidebar', () => {
        const sidebar = { style: {} };
        const origGet = global.document.getElementById;
        global.document.getElementById = (id) => (id === 'sidebar' ? sidebar : null);

        router.setSidebarVisibility(false);
        expect(sidebar.style.display).toBe('none');
        router.setSidebarVisibility(true);
        expect(sidebar.style.display).toBe('block');

        global.document.getElementById = origGet;
    });

    // ============================================================
    // REGRESI: script halaman (config.js, utils.js, api.js, auth.js)
    // berada DI DALAM #main-content -> element <script>-nya terhapus
    // saat konten ditukar. Kalau router hanya membaca DOM untuk
    // mengecek "sudah termuat", script yang sama di-inject ulang ->
    // "SyntaxError: Identifier 'X' has already been declared".
    // ============================================================
    describe('penanganan script yang bentrok global', () => {

        test('daftar script termuat disimpan di memori (bukan dari DOM)', () => {
            expect(router.loadedScriptPaths instanceof Set).toBe(true);
            expect(router.loadedScriptNames instanceof Set).toBe(true);
        });

        test('globalExists: true untuk global yang ada, false untuk yang tidak', () => {
            global.__testGlobalObj = { a: 1 };
            expect(router.globalExists('__testGlobalObj')).toBe(true);
            expect(router.globalExists('__globalYangTidakAda')).toBe(false);
            delete global.__testGlobalObj;
        });

        test('mergeScriptGlobals: method script digabung ke global yang sudah ada', async () => {
            const target = { get: () => 'lama' };
            global.__mergeTarget = target;

            // script sederhana yang mendeklarasikan object global sama
            const scriptUrl = 'data:text/javascript,' + encodeURIComponent(
                'const __mergeTarget = { get: () => "baru", post: () => "post" };'
            );

            await router.mergeScriptGlobals(scriptUrl, '__mergeTarget');

            expect(target.get()).toBe('baru');     // method dari script baru menimpa
            expect(typeof target.post).toBe('function'); // method baru ikut tersedia
            expect(global.__mergeTarget).toBe(target);

            delete global.__mergeTarget;
        });

        test('mergeScriptGlobals: script rusak tidak membuat halaman gagal', async () => {
            const target = { get: () => 'lama' };
            global.__mergeTarget2 = target;
            await router.mergeScriptGlobals('data:text/javascript,' + encodeURIComponent('this is not valid javascript ==='), '__mergeTarget2');
            expect(target.get()).toBe('lama');
            delete global.__mergeTarget2;
        });

        test('peta global script memuat api.js & supabase.js (keduanya const API)', () => {
            expect(router.scriptGlobalMap['api.js']).toBe('API');
            expect(router.scriptGlobalMap['supabase.js']).toBe('API');
            expect(router.scriptGlobalMap['utils.js']).toBe('Toast');
        });
    });
});
