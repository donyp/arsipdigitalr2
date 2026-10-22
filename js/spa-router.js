// ============================================================
// SPA Router - Single Page App Navigation System
// ============================================================

class SPARouter {
    constructor() {
        this.currentPage = null;
        this.isLoading = false;
        this.pageCache = {};
        this.isFirstLoad = true; // Track if it's the first page load
        this.pageLoadStart = Date.now(); // Track page load start time
        this.pendingPath = null;   // Navigasi yang diantrikan (klik saat halaman memuat)

        // ============================================================
        // KILL SWITCH
        // ============================================================
        // Set false -> semua navigasi kembali ke full page reload
        // (sidebar & konten di-load ulang seperti biasa)
        this.spaEnabled = true;

        // ============================================================
        // DAFTAR HALAMAN SPA (whitelist)
        // ============================================================
        // Hanya halaman yang:
        //   - punya sidebar yang SAMA (sidebar terlihat / tidak terlihat)
        //     -> kalau berbeda, pindah halaman = full reload (sidebar
        //        harus hilang / muncul, jadi tidak bisa di-swap)
        //   - punya fungsi init yang bisa dipanggil ulang
        //
        // CATATAN: halaman admin zona (/zona/dashboard) TIDAK ada di sini
        // karena halaman itu tidak punya sidebar -> transisi ke sana
        // selalu full reload (supaya sidebar hilang dengan rapi).
        this.menuMapping = {
            '/dashboard': {
                url: '/dashboard',
                hasSidebar: true
            },
            '/notifikasi': {
                url: '/notifikasi',
                hasSidebar: true
            },
            '/user': {
                url: '/user',
                hasSidebar: true
            },
            '/toko': {
                url: '/toko',
                hasSidebar: true
            },
            '/zona': {
                url: '/zona',
                hasSidebar: true
            },
            '/whatsapp-setup': {
                url: '/whatsapp-setup',
                hasSidebar: true
            },
            // Halaman upload & alat - punya sidebar (layout margin-left 16rem)
            '/excel': {
                url: '/excel',
                hasSidebar: true
            },
            '/invoice': {
                url: '/invoice',
                hasSidebar: true
            },
            '/buktibayar': {
                url: '/buktibayar',
                hasSidebar: true
            },
            '/fakturpajak': {
                url: '/fakturpajak',
                hasSidebar: true
            },
            '/renamefaktur': {
                url: '/renamefaktur',
                hasSidebar: true
            },
            '/support/admin': {
                url: '/support/admin',
                hasSidebar: true
            },
            '/logs': {
                url: '/logs',
                hasSidebar: true
            },
            '/kendaraan': {
                url: '/kendaraan',
                hasSidebar: true
            },
            '/penyimpanan': {
                url: '/penyimpanan',
                hasSidebar: true
            },
            '/backup': {
                url: '/backup',
                hasSidebar: true
            }
        };

        // Script yang TIDAK PERNAH di-inject ulang (memuat router itu
        // sendiri -> akan membuat handler klik dobel)
        this.neverReloadScripts = ['spa-router.js'];

        // ============================================================
        // SCRIPT YANG MENYATAKAN GLOBAL SAMA
        // ============================================================
        // js/api.js & js/supabase.js sama-sama mendeklarasikan `const API`
        // (begitu juga CONFIG di config.js, Toast di utils.js).
        // Kalau script yang(global-nya sudah ada) dieksekusi lagi ->
        // "SyntaxError: Identifier 'X' has already been declared" dan
        // kode halaman gagal jalan.
        // Solusi: script dieksekusi di scope terpisah lalu method-nya
        // digabung ke global yang sudah ada (jadi API.del dari
        // supabase.js & API.postFormData dari api.js sama-sama tersedia).
        this.scriptGlobalMap = {
            'api.js': 'API',
            'supabase.js': 'API',
            'config.js': 'CONFIG',
            'utils.js': 'Toast',
            'auth.js': 'currentUser'
        };

        // ============================================================
        // DAFTAR SCRIPT YANG SUDAH TERMUAT
        // ============================================================
        // Disimpan di memori (bukan dibaca dari DOM) karena tag <script>
        // milik halaman berada DI DALAM #main-content -> element-nya
        // terhapus setiap kali konten ditukar, padahal global yang
        // dideklarasikannya masih hidup. Kalau tidak dicatat, script
        // yang sama akan di-inject ulang ->
        // "SyntaxError: Identifier 'X' has already been declared".
        this.loadedScriptPaths = new Set();
        this.loadedScriptNames = new Set();
        this.pageInitCallbacks = {};     // callback DOMContentLoaded per halaman (untuk re-run)
        this.executedInlinePaths = new Set(); // halaman yang inline-script-nya sudah pernah dijalankan
        this.collectLoadedScripts();

        this.init();
    }

    /**
     * Tampilkan / sembunyikan sidebar sesuai halaman tujuan.
     * Dipakai supaya pindah halaman tetap tanpa reload penuh.
     */
    setSidebarVisibility(visible) {
        try {
            const sidebar = document.getElementById('sidebar');
            if (!sidebar) return;
            // Pakai 'block' (bukan '') supaya overrides CSS halaman yang
            // menyembunyikan sidebar (mis. admin zona: #sidebar{display:none})
            sidebar.style.display = visible ? 'block' : 'none';
        } catch (e) {
            // abaikan
        }
    }

    /**
     * Apakah sebuah global (const/let di level atas script) sudah ada?
     */
    globalExists(name) {
        try {
            // eslint-disable-next-line no-eval
            return eval(`typeof ${name} !== 'undefined'`);
        } catch (e) {
            return false;
        }
    }

    /**
     * Eksekusi script di scope terpisah lalu GABUNG method-nya ke global
     * yang sudah ada. Dipakai untuk script yang mendeklarasikan global
     * yang sama dengan script lain (mis. js/api.js vs js/supabase.js).
     */
    async mergeScriptGlobals(url, globalName) {
        try {
            const res = await fetch(url);
            if (!res.ok) return;
            const src = await res.text();

            // Global yang sudah ada (objek) - diambil SEBELUM script
            // dieksekusi di scope terpisah
            let existing = null;
            try {
                // eslint-disable-next-line no-eval
                existing = eval(`(typeof ${globalName} !== 'undefined' && typeof ${globalName} === 'object') ? ${globalName} : null`);
            } catch (e) { existing = null; }

            // Jalankan di scope terpisah -> deklarasi di dalamnya tidak
            // bentrok dengan global yang sudah ada
            // eslint-disable-next-line no-new-func
            const fn = new Function(`${src}\n; return (typeof ${globalName} !== 'undefined') ? ${globalName} : null;`);
            const produced = fn();

            if (produced && existing && typeof produced === 'object' && typeof existing === 'object') {
                Object.assign(existing, produced);
            }
        } catch (e) {
            // Tidak fatal: halaman tetap jalan dengan global yang ada
        }
    }

    /**
     * Catat semua script yang sudah termuat di dokumen ini.
     */
    collectLoadedScripts() {
        try {
            document.querySelectorAll('script[src]').forEach(script => {
                const src = script.getAttribute('src') || '';
                if (!src) return;
                const path = src.split('?')[0];
                this.loadedScriptPaths.add(path);
                this.loadedScriptNames.add(path.split('/').pop());
            });
        } catch (e) {
            // abaikan
        }
    }

    init() {
        // Setup navigation listeners
        document.addEventListener('click', (e) => this.handleLinkClick(e));
        
        // Setup browser back/forward button
        window.addEventListener('popstate', (e) => {
            const path = this.normalizePath(window.location.pathname);
            const config = this.menuMapping[path];
            if (!config) {
                // Di luar whitelist -> muat ulang halaman
                window.location.reload();
                return;
            }
            if (this.isLoading) {
                // Halaman sedang dimuat & user menekan back -> aman dengan reload
                window.location.reload();
                return;
            }
            this.loadPage(path, false);
        });

        // Catat path aktif. Router dimuat DI DALAM halaman itu sendiri,
        // jadi konten sudah ada di DOM - tidak perlu fetch ulang (yang
        // duluan menyebabkan halaman termuat 2x & berkedip).
        const initialPath = window.location.pathname || '/dashboard';
        this.currentPage = initialPath;
        // Halaman pertama sudah di-handle oleh halaman itu sendiri
        // (loader-nya sendiri) -> navigasi berikutnya tidak perlu
        // overlay loader lagi.
        this.isFirstLoad = false;
    }

    handleLinkClick(e) {
        const link = e.target.closest('a[href]');
        if (!link) return;

        const href = link.getAttribute('href');
        
        // Check if it's a valid SPA route
        if (this.isValidRoute(href)) {
            e.preventDefault();
            this.navigate(href);
        }
    }

    /**
     * Normalisasi path: buang trailing slash supaya '/logs/' dan '/logs'
     * dianggap sama (server bisa me-redirect ke bentuk dengan slash).
     */
    normalizePath(path) {
        if (!path) return path;
        return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
    }

    isValidRoute(href) {
        // Hanya route yang ada di whitelist SPA
        if (!this.spaEnabled) return false;
        return this.menuMapping.hasOwnProperty(this.normalizePath(href));
    }

    /**
     * Apakah sidebar saat ini terlihat di layar?
     * (sidebar yang sudah dirender punya .sidebar-container di dalamnya)
     */
    hasVisibleSidebar() {
        const sidebar = document.getElementById('sidebar');
        return !!(sidebar && sidebar.querySelector('.sidebar-container'));
    }

    navigate(path) {
        const normalized = this.normalizePath(path);
        const config = this.menuMapping[normalized];
        if (!config) {
            // Di luar whitelist -> full page reload
            window.location.href = path;
            return;
        }

        // Sidebar hanya disembunyikan/ditampilkan (bukan reload penuh)
        // supaya transisi tetap instan. Halaman tanpa sidebar (mis.
        // admin zona) tetap bisa dibuka lewat navigasi biasa.
        this.setSidebarVisibility(!!config.hasSidebar);

        // Navigasi sedang berjalan -> antrikan, dijalankan setelah selesai
        // (klik terakhir yang menang). URL TIDAK disentuh sekarang supaya
        // tidak terjadi "URL berubah tapi halaman tidak".
        if (this.isLoading) {
            console.log('[SPA Router] Halaman sedang dimuat, navigasi diantrikan');
            this.pendingPath = path;
            return;
        }

        // ============================================================
        // ACUAN PATH AKTIF + HIGHLIGHT PINDAH SEGERA
        // ============================================================
        // window.__spaTargetPath = path tujuan navigasi. Semua pihak
        // (router, init halaman yang memanggil loadSidebar, dropdown)
        // memakai acuan yang sama -> highlight tidak pernah semphit
        // balik ke menu lama, dan URL tetap berubah setelah konten
        // tertukar (menjaga perilaku "klik sekali langsung ganti").
        try {
            window.__spaTargetPath = path;
        } catch (e) { /* abaikan */ }

        if (typeof window.updateSidebarActiveState === 'function') {
            try {
                window.updateSidebarActiveState(path);
            } catch (e) { /* abaikan */ }
        }

        // URL di-update SETELAH konten benar-benar tertukar (di loadPage)
        this.loadPage(path, true);
    }

    async loadPage(path, animate = true) {
        // Don't load if already loading or same page
        if (this.isLoading || this.currentPage === path) return;

        const pageConfig = this.menuMapping[path];
        if (!pageConfig) {
            return;
        }

        this.isLoading = true;
        const mainContent = document.getElementById('main-content');
        if (!mainContent) {
            this.isLoading = false;
            return;
        }

        // Fungsi sidebar asli (dikembalikan setelah navigasi selesai)
        let origInitSidebar = null;
        let origLoadSidebar = null;
        let origAddEventListener = null;   // untuk capture DOMContentLoaded listeners
        try {
            // Show loading state only on first load (refresh/login)
            const isFirstLoadOfSession = this.isFirstLoad;
            let loader = null;
            
            if (animate && isFirstLoadOfSession) {
                // Show loader only on first page load (refresh/login)
                loader = document.querySelector('.page-loader');
                if (loader) {
                    loader.classList.remove('hidden');
                    document.body.classList.add('loading-state');
                    document.documentElement.classList.add('loading-state');
                }
            }

            // Fade out content on subsequent navigations (WITHOUT loader)
            if (animate && !isFirstLoadOfSession) {
                mainContent.style.opacity = '0.5';
                mainContent.style.pointerEvents = 'none';
            }

            // Fetch content
            let pageData;
            if (this.pageCache[path]) {
                pageData = this.pageCache[path];
            } else {
                pageData = await this.fetchPageContent(pageConfig.url);
                this.pageCache[path] = pageData;
            }

            // Handle both old format (string) and new format (object with html and scripts)
            let htmlContent = typeof pageData === 'string' ? pageData : pageData.html;
            let pageScripts = typeof pageData === 'object' && pageData.scripts ? pageData.scripts : [];

            // Update content with smooth transition
            if (animate && !isFirstLoadOfSession) {
                mainContent.style.transition = 'opacity 0.3s ease';
                await new Promise(resolve => setTimeout(resolve, 150));
            }

            // Reset style #main-content ke bersih sebelum menerapkan style
            // halaman tujuan. Penting untuk halaman "body" (tanpa
            // #main-content/#app) yang mengandalkan margin sendiri: kalau
            // style dashboard (margin-left 16rem + width calc(100%-16rem))
            // tertinggal, konten akan terpotong di kanan (double margin).
            mainContent.removeAttribute('style');

            // ============================================================
            // Terapkan LAYOUT halaman tujuan
            // ============================================================
            // Tiap halaman punya gaya shell sendiri (mis. halaman flex
            // vs halaman dengan margin-left 16rem). Tanpa ini, konten
            // halaman baru tampil dengan gaya halaman SEBELUMNYA ->
            // terlihat meleset / berantakan.
            const layout = (typeof pageData === 'object' && pageData.layout) ? pageData.layout : null;
            if (layout) {
                const appEl = document.getElementById('app');
                if (appEl) {
                    if (layout.appStyle) {
                        appEl.setAttribute('style', layout.appStyle);
                    } else {
                        appEl.removeAttribute('style');
                    }
                }
                if (layout.mainContentStyle) {
                    mainContent.setAttribute('style', layout.mainContentStyle);
                    //transition & opacity dipakai router untuk animasi
                    mainContent.style.transition = 'opacity 0.3s ease';
                    mainContent.style.opacity = '0.5';
                    mainContent.style.pointerEvents = 'none';
                }
                // Konten "body" sudah punya margin sendiri -> container
                // tidak boleh menambah offset lagi (hindari dobel 16rem).
                // #main-content juga harus full-width (flex:1) supaya
                // .container di dalamnya punya ruang penuh; kalau tidak,
                // flex item menyusut ke lebar konten -> konten terpotong
                // di kanan.
                if (pageData.bodyFallback) {
                    // Halaman "body" (tanpa #main-content/#app) diasumsikan
                    // body sebagai containing block (full viewport) dengan
                    // sidebar fixed (overlay). Di SPA, #main-content adalah
                    // flex child dari #app (display:flex) -> jika tidak
                    // di-override, flex item menyusut/grow tidak sesuai ->
                    // konten terpotong atau melebar. Paksa #app & #main-content
                    // berperilaku seperti body (block, full width) supaya
                    // .container halaman tujuan menangani offset sidebar sendiri.
                    const appElBf = document.getElementById('app');
                    if (appElBf) {
                        appElBf.style.display = 'block';
                    }
                    mainContent.style.display = 'block';
                    mainContent.style.marginLeft = '0';
                    mainContent.style.width = '100%';
                    mainContent.style.flex = 'none';
                    mainContent.style.minWidth = '0';
                    mainContent.style.maxWidth = 'none';
                }
            }

            // Insert HTML content (scripts are in separate pageScripts array)
            mainContent.innerHTML = htmlContent;
            mainContent.style.opacity = '1';
            mainContent.style.pointerEvents = 'auto';

            // ============================================================
            // HEADER UNIFIED
            // ============================================================
            // Header dibuat sebagai sibling #app di body (DI LUAR
            // #main-content) -> tidak ikut tertukar saat konten
            // ditukar, sehingga header greeting dashboard tetap nongket
            // di halaman lain. Buang yang lama, lalu biarkan script
            // halaman tujuan membuat ulang header-nya sendiri.
            const oldHeader = document.getElementById('unified-header');
            if (oldHeader) oldHeader.remove();
            if (pageData.hasUnifiedHeader) {
                try {
                    if (typeof window.initializeUnifiedHeader === 'function') {
                        window.initializeUnifiedHeader();
                    }
                } catch (e) {
                    console.warn('[SPA Router] Gagal membuat ulang unified header:', e.message);
                }
            }
            // unified-header.css memberi #app padding-top:80px untuk header
            // tetap. Halaman tanpa unified header tidak boleh punya gap 80px
            // di atas (tampil kosong). Override berdasarkan keberadaan
            // elemen unified-header yang baru dibuat.
            const appElPad = document.getElementById('app');
            if (appElPad) {
                appElPad.style.paddingTop = document.getElementById('unified-header') ? '80px' : '0px';
            }
            
            // Inject page-specific styles into head
            const pageStyles = pageData.styles || [];
            if (pageStyles.length > 0) {
                // First, remove any old page-specific styles to avoid conflicts
                const oldStyles = document.querySelectorAll('style[data-spa-page-style]');
                oldStyles.forEach(style => style.remove());
                pageStyles.forEach((styleData, index) => {
                    const styleEl = document.createElement('style');
                    styleEl.textContent = styleData.textContent;
                    styleEl.setAttribute('data-spa-page-style', 'true');
                    styleEl.setAttribute('data-page', path);
                    document.head.appendChild(styleEl);
                });
            }

            // ============================================================
            // SIDEBAR TIDAK BOLEH DI-RENDER ULANG SAAT NAVIGASI SPA
            // ============================================================
            // Sidebar milik dokumen ini (menetap). Kalau script halaman
            // tujuan memanggil initSidebar()/loadSidebar(), sidebar akan
            // dibangun ulang -> elemen <a> yang SEDANG diklik diganti ->
            // browser menjalankan navigasi default -> FULL RELOAD.
            // Karena itu fungsi-fungsi itu dinonaktifkan sementara selama
            // navigasi SPA (sidebar tetap, hanya item aktifnya yang
            // diperbarui oleh router).
            const origInitSidebarBackup = window.initSidebar;
            const origLoadSidebarBackup = window.loadSidebar;
            origInitSidebar = origInitSidebarBackup;
            origLoadSidebar = origLoadSidebarBackup;
            const sidebarStub = function () { /* sidebar tidak di-render ulang */ };
            window.initSidebar = sidebarStub;
            window.loadSidebar = sidebarStub;

            // ============================================================
            // CAPTURE DOMContentLoaded LISTENER (untuk page init)
            // ============================================================
            // Banyak halaman (users, tokos, zonas, upload-excel, kendaraan,
            // dll) menjalankan init-nya di dalam
            // document.addEventListener('DOMContentLoaded', ...). Saat
            // navigasi SPA, DOMContentLoaded TIDAK PERNAH tembak lagi ->
            // init tidak pernah jalan -> halaman stuck di skeleton.
            // Solusi: tangkap callback yang didaftarkan selama script
            // halaman tujuan dieksekusi, lalu panggil manual. Callback
            // juga disimpan per-path supaya bisa di-re-run saat kunjungan
            // berikutnya (tanpa re-inject script -> tidak ada SyntaxError
            // "Identifier already declared").
            const capturedInitCallbacks = [];
            origAddEventListener = document.addEventListener.bind(document);
            document.addEventListener = function(type, fn, opts) {
                if (type === 'DOMContentLoaded' && document.readyState !== 'loading') {
                    if (typeof fn === 'function') capturedInitCallbacks.push(fn);
                    return;
                }
                return origAddEventListener(type, fn, opts);
            };

            // Separate inline scripts from external scripts in pageScripts array
            const inlineScripts = pageScripts.filter(s => !s.src);
            const externalScripts = pageScripts.filter(s => s.src);
            
            // Remove any old page-specific inline scripts to prevent redeclaration errors
            const oldInlineScripts = document.querySelectorAll('script[data-spa-inline-script][data-page]');
            oldInlineScripts.forEach(script => {
                if (script.getAttribute('data-page') !== path) {
                    script.remove();
                }
            });
            
            // Execute external scripts first (if needed)
            for (const scriptData of externalScripts) {
                // Skip external scripts that are already loaded (avoid redeclaration)
                // Extract just the filename without query params for comparison
                const scriptPath = scriptData.src.split('?')[0]; // Remove query string
                const scriptName = scriptPath.split('/').pop(); // Get filename
                
                // PENTING: script halaman (config.js, utils.js, auth.js, dll)
                // berada DI DALAM #main-content, jadi element <script>-nya
                // terhapus saat konten ditukar. Karena itu daftar "sudah
                // termuat" HARUS disimpan di memori (Set), bukan dibaca dari
                // DOM - kalau tidak, script yang sama di-inject ulang ->
                // "SyntaxError: Identifier 'X' has already been declared".
                const alreadyLoaded = this.loadedScriptPaths.has(scriptPath)
                    || this.loadedScriptNames.has(scriptName);
                
                if (alreadyLoaded) {
                    continue;
                }
                
                // Global yang mendeklarasikan script ini sudah ada ->
                // jangan eksekusi di global scope (bikin SyntaxError).
                // Metodenya digabung ke global yang sudah ada.
                const globalName = this.scriptGlobalMap[scriptName];
                if (globalName && this.globalExists(globalName)) {
                    await this.mergeScriptGlobals(scriptData.src, globalName);
                    this.loadedScriptPaths.add(scriptPath);
                    this.loadedScriptNames.add(scriptName);
                    continue;
                }
                
                // Skip common third-party libraries
                if (scriptData.src.includes('jquery') || 
                    scriptData.src.includes('bootstrap') ||
                    scriptData.src.includes('cdn.tailwindcss') ||
                    scriptData.src.includes('xlsx') ||
                    scriptData.src.includes('chart') ||
                    scriptData.src.includes('sweetalert')) {
                    continue;
                }
                
                // Skip script yang WAJIB tidak di-load ulang (mis. router
                // itu sendiri -> handler klik dobel)
                if (this.neverReloadScripts.some(name => scriptPath.includes(name))) {
                    continue;
                }
                
                // Script global (config, auth, utils, sidebar, dll) TIDAK
                // perlu di-load ulang - dan biasanya sudah termuat di
                // dokumen ini. Yang BELUM termuat akan dimuat di atas
                // (dilewati logic "already loaded" hanya kalau memang
                // sudah ada di dokumen).
                
                try {
                    const script = document.createElement('script');
                    script.src = scriptData.src;
                    script.async = false;
                    // Catat bahwa script ini sudah termuat (supaya tidak
                    // di-inject ulang di navigasi berikutnya)
                    this.loadedScriptPaths.add(scriptPath);
                    this.loadedScriptNames.add(scriptName);
                    await new Promise((resolve, reject) => {
                        script.onload = resolve;
                        script.onerror = reject;
                        document.body.appendChild(script);
                    });
                } catch (e) {
                }
            }

            // Execute inline scripts. Selalu dijalankan (termasuk kunjungan
            // berulang) supaya init top-level (mis. loadLogs(1), loadDashboard)
            // tembak lagi. Untuk menghindari SyntaxError "Identifier 'x' has
            // already been declared" (let/const top-level tetap di global
            // lexical scope), script dijalankan di scope BARU (new Function)
            // lalu function declaration-nya dipublikasikan ke window agar
            // tetap bisa dipanggil oleh atribut onclick HTML.
            for (const scriptData of inlineScripts) {
                await this.runInlineScriptFresh(scriptData.textContent, capturedInitCallbacks);
            }

            // Kembalikan document.addEventListener asli
            document.addEventListener = origAddEventListener;

            // Simpan callback init yang baru ditangkap (jika ada)
            if (capturedInitCallbacks.length > 0) {
                this.pageInitCallbacks[path] = (this.pageInitCallbacks[path] || [])
                    .concat(capturedInitCallbacks);
            }

            // Jalankan init halaman (callback DOMContentLoaded yang ditangkap,
            // atau yang disimpan dari kunjungan sebelumnya). Ini yang
            // sebelumnya TIDAK PERNAH jalan karena DOMContentLoaded sudah
            // lewat -> halaman stuck di skeleton / dropzone mati.
            const initCallbacks = this.pageInitCallbacks[path] || [];
            for (const cb of initCallbacks) {
                try {
                    await cb();
                } catch (e) {
                    console.warn('[SPA] Page init error:', e && e.message);
                }
            }

            // Wait for page to stabilize after scripts
            // (dilewati 500 ms -> 200 ms: jeda ini hanya menahan navigasi
            //  berikutnya, bukan menunggu data)
            await new Promise(resolve => setTimeout(resolve, 200));

            // Dispatch spa-page-loaded event to notify page-specific scripts
            // This triggers initialization in pages that listen for this event
            window.dispatchEvent(new CustomEvent('spa-page-loaded', {
                detail: { page: path }
            }));
            
            // Wait for page-specific initialization to complete
            // (1000 ms -> 400 ms; klik saat halaman masih dimuat sudah
            //  diantrikan, jadi tidak perlu menunggu lama)
            await new Promise(resolve => setTimeout(resolve, 400));

            // Kembalikan fungsi sidebar seperti semula
            window.initSidebar = origInitSidebar;
            window.loadSidebar = origLoadSidebar;

            // Clear sidebar inject flag to allow re-render on next page
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                sidebar.removeAttribute('data-injected');
            }

            // Update active sidebar state
            if (window.updateSidebarActiveState) {
                window.updateSidebarActiveState(path);
            }

            // ============================================================
            // URL BARU DIUBAH SETELAH KONTEN SUDAH TERTUKAR
            // ============================================================
            // Dulu pushState dilakukan sebelum loadPage, sehingga kalau
            // navigasi batal (mis. sedang memuat) URL sudah berubah tapi
            // halaman tidak -> user harus klik dua kali.
            try {
                if (window.location.pathname !== path) {
                    window.history.pushState({ page: path }, '', path);
                }
            } catch (e) { /* abaikan */ }

            // Update current page
            this.currentPage = path;

            // Acuan path aktif: kalau ada navigasi yang diantrikan, tunggu
            // tujuan berikutnya (biar highlight tidak semphit balik ke
            // halaman yang baru saja selesai dimuat)
            try {
                window.__spaTargetPath = (this.pendingPath && this.pendingPath !== path)
                    ? this.pendingPath
                    : path;
            } catch (e) { /* abaikan */ }

            // Jalankan navigasi yang diantrikan (klik terakhir yang menang)
            if (this.pendingPath && this.pendingPath !== path) {
                const nextPath = this.pendingPath;
                this.pendingPath = null;
                setTimeout(() => this.navigate(nextPath), 50);
            }

            // Scroll to top
            window.scrollTo(0, 0);

            // Re-initialize any scripts that need to run
            await this.reinitializePageScripts();

            // Hide loader only AFTER page scripts are initialized (data loaded)
            if (isFirstLoadOfSession && loader) {
                // Wait for page to fully initialize before hiding loader
                await new Promise(resolve => {
                    // Wait for any data loading to complete
                    const checkDataLoaded = setInterval(() => {
                        // Check if main content has actual data (not just skeleton)
                        const hasContent = mainContent.querySelector('[data-loaded="true"]') || 
                                         mainContent.innerText.length > 100 ||
                                         mainContent.querySelectorAll('table, .card, [role="main"]').length > 0;
                        
                        if (hasContent || Date.now() - this.pageLoadStart > 5000) {
                            clearInterval(checkDataLoaded);
                            resolve();
                        }
                    }, 100);
                });
                
                loader.classList.add('hidden');
                document.body.classList.remove('loading-state');
                document.documentElement.classList.remove('loading-state');
                
                // Remove loader from DOM entirely after animation completes
                setTimeout(() => {
                    if (loader && loader.parentNode) {
                        loader.remove();
                    }
                }, 500);
                this.isFirstLoad = false;
            }
        } catch (error) {
            // ============================================================
            // FALLBACK AMAN
            // ============================================================
            // Kalau navigasi SPA gagal (mis. script halaman error),
            // jangan tampilkan halaman kosong/error - muat ulang halaman
            // secara penuh supaya user selalu dapat halaman yang utuh.
            console.error('[SPA Router] Navigasi gagal, fallback ke full reload:', error);
            try {
                window.__spaTargetPath = null;
                // Kembalikan fungsi sidebar (kalau tidak, sidebar tidak bisa
                // dirender ulang lagi di dokumen ini)
                if (typeof origInitSidebar !== 'undefined') window.initSidebar = origInitSidebar;
                if (typeof origLoadSidebar !== 'undefined') window.loadSidebar = origLoadSidebar;
                if (origAddEventListener) document.addEventListener = origAddEventListener;
                mainContent.style.opacity = '1';
                mainContent.style.pointerEvents = 'auto';
                const loader = document.querySelector('.page-loader');
                if (loader) loader.classList.add('hidden');
                document.body.classList.remove('loading-state');
                document.documentElement.classList.remove('loading-state');
            } catch (_) { /* abaikan */ }
            window.location.href = path;
            this.isFirstLoad = false;
        } finally {
            this.isLoading = false;
        }
    }

    async fetchPageContent(url) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                // Selalu ambil versi terbaru. Tanpa ini, browser bisa memakai
                // redirect/respons lama dari cache (mis. 301 lama ke https)
                // -> fetch gagal -> SPA jatuh ke full reload.
                cache: 'no-store',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'text/html'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const html = await response.text();

            // Extract main content from the page
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Style shell halaman tujuan (supaya layout tiap halaman sama
            // seperti saat halaman itu dibuka penuh)
            const targetApp = doc.getElementById('app');
            const targetMain = doc.getElementById('main-content');

            // Strategy 1: Look for main-content div (semua halaman utama punya)
            let mainContent = doc.getElementById('main-content');
            let bodyFallback = false;
            
            // Strategy 2: Look for app div and get content (skipping sidebar)
            if (!mainContent) {
                const appDiv = doc.getElementById('app');
                if (appDiv) {
                    // Clone the app div to preserve its structure
                    const appClone = appDiv.cloneNode(true);
                    // Remove sidebar from clone
                    const sidebar = appClone.querySelector('#sidebar');
                    if (sidebar) sidebar.remove();
                    mainContent = appClone;
                } else {
                    // Strategy 3: body content TANPA sidebar/header
                    // (kalau sidebar ikut terbawa, sidebar akan dobel
                    //  saat konten di-swap)
                    const bodyClone = doc.body.cloneNode(true);
                    bodyClone.querySelectorAll('#sidebar, #unified-header, .page-loader')
                        .forEach(el => el.remove());
                    mainContent = bodyClone;
                    // Konten jenis ini sudah punya margin sendiri
                    // (mis. margin-left 16rem) -> container tujuan tidak
                    // boleh menambah offset lagi.
                    bodyFallback = true;
                }
            }

            if (!mainContent) {
                throw new Error('Could not find main content in page');
            }

            // Buang tag <script> dari konten yang disalin - script-nya
            // di-inject terpisah (lihat executeScripts) supaya tidak
            // dieksekusi dua kali.
            const contentClone = mainContent.cloneNode(true);
            contentClone.querySelectorAll('script').forEach(s => s.remove());
            const contentHtml = contentClone.innerHTML;

            // Also extract all scripts from the page (both inline and external)
            const allScripts = Array.from(doc.querySelectorAll('script'));
            const scriptData = allScripts.map(script => ({
                src: script.src,
                textContent: script.textContent,
                type: script.type
            }));

            // Also extract styles from head (for pages with custom styling)
            const allStyles = Array.from(doc.querySelectorAll('style'));
            const styleData = allStyles.map(style => ({
                textContent: style.textContent,
                type: style.type || 'text/css'
            }));

            // Return HTML, script data, style data, dan layout
            return {
                html: contentHtml,
                scripts: scriptData,
                styles: styleData,
                hasUnifiedHeader: html.indexOf('unified-header.js') >= 0,
                bodyFallback: bodyFallback,
                layout: {
                    appStyle: targetApp ? targetApp.getAttribute('style') : null,
                    mainContentStyle: targetMain ? targetMain.getAttribute('style') : null
                }
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Jalankan inline script di scope BARU (new Function) supaya
     * deklarasi let/const/var top-level tidak bentrok dengan yang sudah
     * ada dari kunjungan sebelumnya (yang tetap hidup di global lexical
     * scope). Function declaration yang didefinisikan di script
     * dipublikasikan ke window agar tetap bisa dipanggil oleh atribut
     * onclick di HTML. Callback DOMContentLoaded yang didaftarkan selama
     * eksekusi ditangkap (push ke capturedInitCallbacks) supaya bisa
     * dijalankan manual.
     */
    async runInlineScriptFresh(src, capturedInitCallbacks) {
        if (!src || !src.trim()) return;
        // Tangkap nama function declaration untuk dipublikasikan
        const fnNames = new Set();
        const re = /(?:^|[\\n;{}])\\s*(?:async\\s+)?function\\s+([A-Za-z_$][\\w$]*)/g;
        let m;
        while ((m = re.exec(src)) !== null) fnNames.add(m[1]);

        // Shim document.addEventListener selama eksekusi
        const origAEL = document.addEventListener.bind(document);
        document.addEventListener = function(type, fn, opts) {
            if (type === 'DOMContentLoaded' && document.readyState !== 'loading') {
                if (typeof fn === 'function' && capturedInitCallbacks) capturedInitCallbacks.push(fn);
                return;
            }
            return origAEL(type, fn, opts);
        };

        const returnStmt = fnNames.size
            ? '\\n; return { ' + [...fnNames].join(', ') + ' };'
            : '';
        try {
            // eslint-disable-next-line no-new-func
            const fn = new Function(src + returnStmt);
            const result = fn.call(window);
            if (result && typeof result === 'object') {
                for (const k of Object.keys(result)) {
                    if (typeof result[k] === 'function') {
                        window[k] = result[k];
                    }
                }
            }
        } catch (e) {
            console.warn('[SPA] Inline script (fresh) error:', e && e.message);
        } finally {
            document.addEventListener = origAEL;
        }
    }

    async reinitializePageScripts() {
        // Re-run any initialization scripts that need to happen on new page content
        
        // First, handle data-init scripts
        const scripts = document.querySelectorAll('[data-init]');
        scripts.forEach(script => {
            try {
                eval(script.textContent);
            } catch (e) {
            }
        });

        // Also look for and run inline scripts in the main content
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            const inlineScripts = mainContent.querySelectorAll('script:not([src])');
            inlineScripts.forEach(script => {
                try {
                    // Create and execute a new script to ensure proper scope
                    const newScript = document.createElement('script');
                    newScript.textContent = script.textContent;
                    document.body.appendChild(newScript);
                    document.body.removeChild(newScript);
                } catch (e) {
                }
            });
        }

        // ============================================================
        // SIDEBAR: JANGAN render ulang saat pindah route
        // ============================================================
        // Sidebar tetap persis sama (tidak berkedip). Yang berubah hanya
        // item aktifnya. Kalau sidebar belum pernah dirender (mis. halaman
        // tanpa sidebar), skip.
        if (typeof window.updateSidebarActiveState === 'function') {
            try {
                window.updateSidebarActiveState();
            } catch (e) {
                console.warn('[SPA Router] Gagal update status aktif sidebar:', e.message);
            }
        }

        // Trigger custom event that pages can listen for
        window.dispatchEvent(new CustomEvent('spa-page-loaded', { detail: { page: this.currentPage } }));
        
        // Wait for page initialization to complete
        return new Promise(resolve => setTimeout(resolve, 500));
    }

    // Preload a page in background
    preload(path) {
        if (!this.pageCache[path] && this.menuMapping[path]) {
            this.fetchPageContent(this.menuMapping[path].url)
                .then(content => {
                    this.pageCache[path] = content;
                })
                .catch(e => {});
        }
    }

    // Clear cache
    clearCache(path = null) {
        if (path) {
            delete this.pageCache[path];
        } else {
            this.pageCache = {};
        }
    }
}

// Initialize SPA Router when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.spaRouter = new SPARouter();
    });
} else {
    window.spaRouter = new SPARouter();
}
