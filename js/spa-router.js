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
            }
        };

        // Script yang TIDAK PERNAH di-inject ulang (memuat router itu
        // sendiri -> akan membuat handler klik dobel)
        this.neverReloadScripts = ['spa-router.js'];

        this.init();
    }

    init() {
        // Setup navigation listeners
        document.addEventListener('click', (e) => this.handleLinkClick(e));
        
        // Setup browser back/forward button
        window.addEventListener('popstate', (e) => {
            const path = window.location.pathname;
            const config = this.menuMapping[path];
            if (!config) {
                // Di luar whitelist -> muat ulang halaman
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

    isValidRoute(href) {
        // Hanya route yang ada di whitelist SPA
        if (!this.spaEnabled) return false;
        return this.menuMapping.hasOwnProperty(href);
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
        const config = this.menuMapping[path];
        if (!config) {
            // Di luar whitelist -> full page reload
            window.location.href = path;
            return;
        }

        // Pindah antar halaman dengan kondisi sidebar berbeda
        // (mis. dashboard -> /zona/dashboard yang tidak punya sidebar)
        // -> full reload supaya sidebar hilang/ muncul dengan rapi
        if (this.hasVisibleSidebar() !== !!config.hasSidebar) {
            window.location.href = path;
            return;
        }

        // Update URL tanpa reload
        window.history.pushState({ page: path }, '', path);
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

            // Insert HTML content (scripts are in separate pageScripts array)
            mainContent.innerHTML = htmlContent;
            mainContent.style.opacity = '1';
            mainContent.style.pointerEvents = 'auto';
            
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
                
                // Check if any loaded script has this name (ignore query params)
                const allScripts = document.querySelectorAll('script[src]');
                let alreadyLoaded = false;
                for (const existingScript of allScripts) {
                    const existingPath = existingScript.src.split('?')[0];
                    const existingName = existingPath.split('/').pop();
                    if (existingName === scriptName && existingPath === scriptPath) {
                        alreadyLoaded = true;
                        break;
                    }
                }
                
                if (alreadyLoaded) {
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
                    await new Promise((resolve, reject) => {
                        script.onload = resolve;
                        script.onerror = reject;
                        document.body.appendChild(script);
                    });
                } catch (e) {
                }
            }

            // Execute inline scripts after content and external scripts
            // These scripts define functions and set up event listeners
            for (const scriptData of inlineScripts) {
                try {
                    const newScript = document.createElement('script');
                    newScript.textContent = scriptData.textContent;
                    newScript.setAttribute('data-spa-inline-script', 'true');
                    newScript.setAttribute('data-page', path);
                    document.body.appendChild(newScript);
                    // Wait for script to fully execute before next one
                    await new Promise(resolve => setTimeout(resolve, 50));
                } catch (e) {
                    console.warn('[SPA] Inline script error:', e.message);
                }
            }

            // Wait for page to stabilize after scripts
            await new Promise(resolve => setTimeout(resolve, 500));

            // Dispatch spa-page-loaded event to notify page-specific scripts
            // This triggers initialization in pages that listen for this event
            window.dispatchEvent(new CustomEvent('spa-page-loaded', {
                detail: { page: path }
            }));
            
            // Wait for page-specific initialization to complete
            // This is crucial - pages need time to fetch data and render
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Clear sidebar inject flag to allow re-render on next page
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                sidebar.removeAttribute('data-injected');
            }

            // Update active sidebar state
            if (window.updateSidebarActiveState) {
                window.updateSidebarActiveState(path);
            }

            // Update current page
            this.currentPage = path;

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

            // Strategy 1: Look for main-content div (semua halaman utama punya)
            let mainContent = doc.getElementById('main-content');
            
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

            // Return both HTML, script data, and style data
            return {
                html: contentHtml,
                scripts: scriptData,
                styles: styleData
            };
        } catch (error) {
            throw error;
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
