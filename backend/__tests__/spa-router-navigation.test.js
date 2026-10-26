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
        router.transition.routes = null;
        router.clearTransitionDimTimer();
    });

    test('konfigurasi memakai slide-up (bukan fade)', () => {
        expect(router.transition.enabled).toBe(true);
        expect(router.transition.shiftPx).toBeGreaterThan(10);   // naik dari bawah
        expect(router.transition.enterMs).toBeGreaterThanOrEqual(300); // smooth
    });

    test('SEMUA menu di sidebar dianimasikan (routes = null)', () => {
        expect(router.transition.routes).toBeNull();
        expect(router.isTransitionEnabled('/dashboard')).toBe(true);
        expect(router.isTransitionEnabled('/notifikasi')).toBe(true);
        expect(router.isTransitionEnabled('/support/admin')).toBe(true);
        expect(router.isTransitionEnabled('/renamefaktur')).toBe(true);
        expect(router.isTransitionEnabled('/excel')).toBe(true);
        expect(router.isTransitionEnabled('/excel/')).toBe(true);   // trailing slash
    });

    test('kalau routes diisi, hanya route itu yang dianimasikan', () => {
        router.transition.routes = ['/support/admin'];
        expect(router.isTransitionEnabled('/support/admin')).toBe(true);
        expect(router.isTransitionEnabled('/dashboard')).toBe(false);
        router.transition.routes = null;
    });

    test('startPageTransition: route menu dapat token > 0 (animasi jalan)', () => {
        const el = fakeMain();
        expect(router.startPageTransition(el, '/dashboard')).toBeGreaterThan(0);
        router.clearTransitionDimTimer();
    });

    test('startPageTransition: route di luar daftar (mode dibatasi) -> 0', () => {
        const el = fakeMain();
        router.transition.routes = ['/support/admin'];
        const token = router.startPageTransition(el, '/dashboard');
        expect(token).toBe(0);
        expect(el.classes.size).toBe(0);
        expect(router.transitionDimTimer).toBeFalsy();
        router.transition.routes = null;
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

    test('semua halaman menu dianimasikan saat dibuka penuh (css/color-vars.css)', () => {
        const css = require('fs').readFileSync(
            path.join(__dirname, '..', '..', 'css', 'color-vars.css'), 'utf8'
        );
        expect(css).toContain('@keyframes appPageSlideUp');
        expect(css).toContain('#main-content:not([data-spa-nav])');
        expect(css).toContain('#sidebar + *');           // halaman tanpa #main-content
        expect(css).toContain('prefers-reduced-motion');
        // slide-up murni: hanya transform, tanpa opacity
        const keyframes = css.slice(css.indexOf('@keyframes appPageSlideUp'));
        const body = keyframes.slice(0, keyframes.indexOf('}'));
        expect(body).not.toContain('opacity');
    });

    test('router menandai data-spa-nav (animasi halaman tidak dobel saat SPA)', () => {
        expect(routerSrc).toContain("mainContent.setAttribute('data-spa-nav', '1')");
    });

    test('semua halaman yang punya #main-content memuat spa-router.js', () => {
        const fs = require('fs');
        const pages = [
            'dashboard.html', 'whatsapp-messages.html', 'users.html', 'tokos.html',
            'zonas.html', 'rename-faktur.html', 'upload-excel.html',
            'upload-invoice-pdf.html', 'upload-bukti-bayar.html',
            'upload-faktur-pajak.html', 'support-dashboard.html'
        ];
        const missing = pages.filter(p => {
            const html = fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
            return !/\/js\/spa-router\.js\?v=\d+/.test(html);
        });
        expect(missing).toEqual([]);
    });

    test('animasi tidak lagi ditulis ulang per halaman (cukup di color-vars.css)', () => {
        const html = require('fs').readFileSync(
            path.join(__dirname, '..', '..', 'support-dashboard.html'), 'utf8'
        );
        expect(html).not.toContain('@keyframes supportPageSlideUp');
    });
});

// ============================================================
// INIT HALAMAN TIDAK MENUMPUK SAAT NAVIGASI SPA
// (gejala: tombol pengumuman di header dashboard jadi 1, 2, 3, ...)
// ============================================================
describe('Init halaman tidak menumpuk saat SPA', () => {

    const fs = require('fs');
    const routerSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'js', 'spa-router.js'), 'utf8'
    );
    const dashboardHtml = fs.readFileSync(
        path.join(__dirname, '..', '..', 'dashboard.html'), 'utf8'
    );

    test('callback dari script inline ditandai __spaInlineInit', () => {
        expect(routerSrc).toContain('fn.__spaInlineInit = true');
    });

    test('callback inline diperbarui (diganti), bukan ditumpuk', () => {
        expect(routerSrc).toContain('!cb.__spaInlineInit');
        expect(routerSrc).toContain('dariScriptEksternal.concat(capturedInitCallbacks)');
        // pola lama yang menumpuk tidak boleh kembali
        expect(routerSrc).not.toMatch(
            /this\.pageInitCallbacks\[path\] = \(this\.pageInitCallbacks\[path\] \|\| \[\]\)\s*\.concat\(capturedInitCallbacks\)/
        );
    });

    test('tombol pengumuman dashboard diberi id + penanda', () => {
        expect(dashboardHtml).toContain("announcementBtn.id = 'announcementManageBtn'");
        expect(dashboardHtml).toContain("announcementBtn.setAttribute('data-announcement-manage', '1')");
    });

    test('tombol pengumuman hanya dibuat kalau belum ada', () => {
        expect(dashboardHtml).toContain("querySelectorAll('[data-announcement-manage]')");
        expect(dashboardHtml).toMatch(/sudahAda\.length === 0[\s\S]{0,500}createElement\('button'\)/);
        // sisa duplikat dibersihkan
        expect(dashboardHtml).toContain('if (i > 0) el.remove()');
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

// ============================================================
// REGRESI: fungsi inline (editZona, editToko, dll.) harus
// dipublikasikan ke window saat navigasi SPA. Dulu regex-nya
// double-escape (\\n / \\s) sehingga tidak ada fungsi yang
// ditemukan -> onclick "editZona is not defined" (baru normal
// setelah full refresh).
// ============================================================
describe('Inline script: fungsi untuk onclick dipublikasikan', () => {

    test('fungsi top-level dipublikasikan ke window', async () => {
        const captured = [];
        await router.runInlineScriptFresh(`
            function editZona(id) { return 'edit:' + id; }
            async function saveZona() { return 'saved'; }
            function outer() {
                function nestedOnly() { return 1; }
            }
        `, captured);

        expect(typeof global.window.editZona).toBe('function');
        expect(global.window.editZona('7')).toBe('edit:7');
        expect(typeof global.window.saveZona).toBe('function');
        expect(typeof global.window.outer).toBe('function');

        // Function di dalam function lain tidak boleh membuat
        // seluruh proses publikasi gagal (guard typeof).
        expect(global.window.nestedOnly).toBeUndefined();

        delete global.window.editZona;
        delete global.window.saveZona;
        delete global.window.outer;
    });

    test('DOMContentLoaded callback tetap ditangkap', async () => {
        const captured = [];
        await router.runInlineScriptFresh(`
            function initPage() { return true; }
            document.addEventListener('DOMContentLoaded', initPage);
        `, captured);

        expect(typeof global.window.initPage).toBe('function');
        expect(captured.length).toBe(1);
        expect(typeof captured[0]).toBe('function');

        delete global.window.initPage;
    });
});

// ============================================================
// REGRESI: modal halaman sering berada di luar #main-content.
// Saat SPA hanya #main-content yang ditukar, modal tidak ikut ->
// openUserModal() error "Cannot set properties of null".
// ============================================================
describe('Modal di luar #main-content ikut dibawa saat SPA', () => {

    const makeEl = (id, className, children = []) => {
        const el = {
            id,
            className,
            nodeType: 1,
            children,
            classList: {
                contains(cls) { return (className || '').split(/\s+/).includes(cls); }
            },
            contains(other) {
                if (other === el) return true;
                return children.some(child =>
                    child === other || (child.contains && child.contains(other))
                );
            }
        };
        return el;
    };

    test('modal luar diambil, modal dalam konten tidak diduplikasi', () => {
        const insideModal = makeEl('insideModal', 'modal');
        const main = makeEl('main-content', '', [insideModal]);
        const userModal = makeEl('userModal', '', [makeEl('editUserId', '')]);
        const classModal = makeEl('someDialog', 'modal');
        const title = makeEl('userModalTitle', '');
        const nestedInner = makeEl('nestedModal', 'modal');
        const nestedOuter = makeEl('detailModal', 'modal', [nestedInner]);

        const doc = {
            querySelectorAll: () => [
                insideModal, userModal, classModal, title, nestedOuter, nestedInner
            ]
        };

        const result = router.collectExternalPageModals(doc, main);
        const ids = result.map(el => el.id).sort();

        expect(ids).toEqual(['detailModal', 'someDialog', 'userModal']);
    });

    test('fetchPageContent mengembalikan modalIds & loadPage membersihkan id lama', () => {
        const src = require('fs').readFileSync(
            path.join(__dirname, '..', '..', 'js', 'spa-router.js'), 'utf8'
        );

        expect(src).toContain('modalIds: modalIds');
        expect(src).toMatch(/collectExternalPageModals\(doc, sourceRoot\)/);
        expect(src).toMatch(/targetModalIds/);
    });
});
