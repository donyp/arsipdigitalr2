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
        // Halaman setup bot WA dihapus -> full reload (dan redirect ke /whatsapp-bot)
        expect(router.isValidRoute('/whatsapp-setup')).toBe(false);
        expect(router.isValidRoute('/whatsapp-bot')).toBe(false);

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

// ============================================================
// ANIMASI PINDAH HALAMAN (SLIDE-UP DARI BAWAH)
// ============================================================
describe('Animasi masuk halaman (slide-up)', () => {

    const routerSrc = require('fs').readFileSync(
        path.join(__dirname, '..', '..', 'js', 'spa-router.js'), 'utf8'
    );

    function fakeMain() {
        const classes = new Set();
        return {
            classes,
            offsetWidth: 100,
            style: {},
            classList: {
                add: (...cs) => cs.forEach(c => classes.add(c)),
                remove: (...cs) => cs.forEach(c => classes.delete(c)),
                contains: (c) => classes.has(c)
            },
            addEventListener: () => {},
            removeEventListener: () => {}
        };
    }

    afterEach(() => {
        router.transition.enabled = true;
        router.clearTransitionDimTimer();
    });

    test('konfigurasi memakai slide-up (bukan fade)', () => {
        expect(router.transition.enabled).toBe(true);
        expect(router.transition.shiftPx).toBeGreaterThan(10);   // naik dari bawah
        expect(router.transition.enterMs).toBeGreaterThanOrEqual(300); // smooth
    });

    test('animasi HANYA untuk menu Support Admin', () => {
        expect(router.transition.routes).toEqual(['/support/admin']);
        expect(router.isTransitionEnabled('/support/admin')).toBe(true);
        expect(router.isTransitionEnabled('/dashboard')).toBe(false);
        expect(router.isTransitionEnabled('/renamefaktur')).toBe(false);
        expect(router.isTransitionEnabled('/toko')).toBe(false);
    });

    test('route lain: tidak ada class animasi sama sekali', () => {
        const el = fakeMain();
        const token = router.startPageTransition(el, '/dashboard');
        expect(token).toBe(0);
        expect(el.classes.size).toBe(0);
        expect(router.transitionDimTimer).toBeFalsy();
    });

    test('route Support Admin: transisi dimulai (token > 0)', () => {
        const el = fakeMain();
        const token = router.startPageTransition(el, '/support/admin');
        expect(token).toBeGreaterThan(0);
        router.clearTransitionDimTimer();
    });

    test('keyframes slide-up: hanya transform, TANPA opacity', () => {
        expect(routerSrc).toContain('@keyframes spaPageSlideUp');
        // from: bergeser ke bawah, tanpa opacity: 0
        expect(routerSrc).toMatch(/from\s*\{\s*transform:\s*translate3d\(0,\s*\$\{t\.shiftPx\}px,\s*0\);\s*\}/);
        expect(routerSrc).not.toMatch(/spaPageSlideUp[\s\S]{0,300}opacity/);
        // saat masuk, opacity dipaksa 1 (tanpa fade-in)
        expect(routerSrc).toMatch(/\.spa-entering\s*\{[\s\S]{0,200}opacity:\s*1\s*!important/);
    });

    test('enterPage: menambah class spa-entering dan membersihkan class lain', () => {
        const el = fakeMain();
        el.classes.add('spa-loading');
        el.classes.add('spa-swapping');
        const orig = router.transition.enterMs;
        router.transition.enterMs = 0;
        router.enterPage(el);
        expect(el.classes.has('spa-entering')).toBe(true);
        expect(el.classes.has('spa-loading')).toBe(false);
        expect(el.classes.has('spa-swapping')).toBe(false);
        router.transition.enterMs = orig;
    });

    test('startPageTransition: tidak langsung meredup (anti kedip di halaman cache)', () => {
        const el = fakeMain();
        const token = router.startPageTransition(el);
        expect(token).toBeGreaterThan(0);
        expect(el.classes.has('spa-loading')).toBe(false);
        router.clearTransitionDimTimer();
    });

    test('resetPageTransition: membersihkan semua class transisi', () => {
        const el = fakeMain();
        el.classes.add('spa-loading');
        el.classes.add('spa-swapping');
        el.classes.add('spa-entering');
        router.resetPageTransition(el);
        expect(el.classes.size).toBe(0);
    });

    test('kill switch: transition.enabled=false -> tanpa animasi', () => {
        router.transition.enabled = false;
        const el = fakeMain();
        router.enterPage(el);
        expect(el.classes.has('spa-entering')).toBe(false);
    });

    test('menghormati prefers-reduced-motion', () => {
        expect(routerSrc).toContain('prefers-reduced-motion');
        expect(typeof router.prefersReducedMotion).toBe('function');
    });

    test('CSS di-inject dari router (semua halaman dapat animasi tanpa edit HTML)', () => {
        expect(routerSrc).toContain('installTransitionStyles');
        expect(routerSrc).toContain('spa-page-transition-style');
        expect(routerSrc).toContain('document.head.appendChild(style)');
    });

    test('scroll ke atas dilakukan tepat setelah konten ditukar', () => {
        const swapIdx = routerSrc.indexOf('mainContent.innerHTML = htmlContent');
        const scrollIdx = routerSrc.indexOf('window.scrollTo(0, 0)', swapIdx);
        expect(swapIdx).toBeGreaterThan(-1);
        expect(scrollIdx).toBeGreaterThan(swapIdx);
        expect(scrollIdx - swapIdx).toBeLessThan(600);
    });

    test('sisa fade lama (opacity 0.5 inline) sudah dihapus', () => {
        expect(routerSrc).not.toContain("mainContent.style.opacity = '0.5'");
    });

    test('halaman Support Admin tetap dianimasikan saat dibuka langsung', () => {
        const html = require('fs').readFileSync(
            path.join(__dirname, '..', '..', 'support-dashboard.html'), 'utf8'
        );
        expect(html).toContain('@keyframes supportPageSlideUp');
        expect(html).toMatch(/#main-content:not\(\[data-page\]\)\s*\{\s*animation:\s*supportPageSlideUp/);
    });

    test('halaman lain tidak diberi animasi saat load', () => {
        const html = require('fs').readFileSync(
            path.join(__dirname, '..', '..', 'whatsapp-bot-dashboard.html'), 'utf8'
        );
        expect(html).not.toContain('appPageSlideUp');
    });
});

// ============================================================
// ANTRIAN NAVIGASI (klik menu saat halaman masih memuat)
// ============================================================
describe('Navigasi yang diantrikan', () => {

    const routerSrc = require('fs').readFileSync(
        path.join(__dirname, '..', '..', 'js', 'spa-router.js'), 'utf8'
    );

    test('klik saat memuat tetap diantrikan (bukan dibuang)', () => {
        router.isLoading = true;
        router.pendingPath = null;
        router.navigate('/zona');
        expect(router.pendingPath).toBe('/zona');
        router.isLoading = false;
        router.pendingPath = null;
    });

    test('antrian dijalankan SETELAH isLoading=false (bukan sebelumnya)', () => {
        const clearIdx = routerSrc.indexOf('this.isLoading = false;');
        const runIdx = routerSrc.indexOf('const nextPath = this.pendingPath;');
        expect(clearIdx).toBeGreaterThan(-1);
        expect(runIdx).toBeGreaterThan(clearIdx);
    });

    test('tidak ada lagi penjadwalan antrian sebelum reinitialize (bug klik hilang)', () => {
        // Penjadwalan lama: setTimeout(..., 50) sebelum reinitializePageScripts()
        expect(routerSrc).not.toMatch(/setTimeout\(\(\) => this\.navigate\(nextPath\), 50\)/);
    });
});
