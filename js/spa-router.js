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
        this.menuMapping = {
            '/dashboard': { url: 'dashboard.html', title: 'Dashboard' },
            '/dashboard.html': { url: 'dashboard.html', title: 'Dashboard' },
            '/whatsapp-messages': { url: 'whatsapp-messages.html', title: 'Notify Zona' },
            '/whatsapp-messages.html': { url: 'whatsapp-messages.html', title: 'Notify Zona' },
            '/support-dashboard': { url: 'support-dashboard.html', title: 'Support Dashboard' },
            '/support-dashboard.html': { url: 'support-dashboard.html', title: 'Support Dashboard' },
            '/rename-faktur': { url: 'rename-faktur.html', title: 'Rename Faktur Pajak' },
            '/rename-faktur.html': { url: 'rename-faktur.html', title: 'Rename Faktur Pajak' },
            '/upload-excel': { url: 'upload-excel.html', title: 'Upload Excel' },
            '/upload-excel.html': { url: 'upload-excel.html', title: 'Upload Excel' },
            '/upload-invoice-pdf.html': { url: 'upload-invoice-pdf.html', title: 'Upload Invoice PDF' },
            '/upload-bukti-bayar': { url: 'upload-bukti-bayar.html', title: 'Upload Bukti Bayar' },
            '/upload-bukti-bayar.html': { url: 'upload-bukti-bayar.html', title: 'Upload Bukti Bayar' },
            '/upload-faktur': { url: 'upload-faktur-pajak.html', title: 'Upload Faktur Pajak' },
            '/upload-faktur.html': { url: 'upload-faktur-pajak.html', title: 'Upload Faktur Pajak' },
            '/upload-faktur-pajak.html': { url: 'upload-faktur-pajak.html', title: 'Upload Faktur Pajak' },
            '/users': { url: 'users.html', title: 'Manajemen Pengguna' },
            '/users.html': { url: 'users.html', title: 'Manajemen Pengguna' },
            '/tokos': { url: 'tokos.html', title: 'Daftar Toko' },
            '/tokos.html': { url: 'tokos.html', title: 'Daftar Toko' },
            '/zonas': { url: 'zonas.html', title: 'Zona Operasional' },
            '/zonas.html': { url: 'zonas.html', title: 'Zona Operasional' },
        };
        
        this.init();
    }

    init() {
        // Setup navigation listeners
        document.addEventListener('click', (e) => this.handleLinkClick(e));
        
        // Setup browser back/forward button
        window.addEventListener('popstate', (e) => {
            const path = window.location.pathname;
            this.loadPage(path, false);
        });

        // Initialize with current page
        const initialPath = window.location.pathname || '/dashboard';
        this.loadPage(initialPath, false);

        console.log('[SPA] Router initialized');
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
        // Only handle routes that are in our menu mapping
        return this.menuMapping.hasOwnProperty(href);
    }

    navigate(path) {
        // Update URL without reload
        window.history.pushState({ page: path }, '', path);
        this.loadPage(path, true);
    }

    async loadPage(path, animate = true) {
        // Don't load if already loading or same page
        if (this.isLoading || this.currentPage === path) return;

        const pageConfig = this.menuMapping[path];
        if (!pageConfig) {
            console.warn('[SPA] Unknown route:', path);
            return;
        }

        this.isLoading = true;
        const mainContent = document.getElementById('main-content');
        if (!mainContent) {
            console.error('[SPA] main-content element not found');
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
                    console.log('[SPA] Loader shown on first load');
                }
            }

            // Fade out content on subsequent navigations (WITHOUT loader)
            if (animate && !isFirstLoadOfSession) {
                mainContent.style.opacity = '0.5';
                mainContent.style.pointerEvents = 'none';
            }

            // Fetch content
            let content;
            if (this.pageCache[path]) {
                content = this.pageCache[path];
                console.log('[SPA] Loaded from cache:', path);
            } else {
                content = await this.fetchPageContent(pageConfig.url);
                this.pageCache[path] = content;
                console.log('[SPA] Fetched from server:', path);
            }

            // Update content with smooth transition
            if (animate && !isFirstLoadOfSession) {
                mainContent.style.transition = 'opacity 0.3s ease';
                await new Promise(resolve => setTimeout(resolve, 150));
            }

            mainContent.innerHTML = content;
            mainContent.style.opacity = '1';
            mainContent.style.pointerEvents = 'auto';

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
                console.log('[SPA] Loader hidden after data loaded');
                this.isFirstLoad = false;
            }

            console.log('[SPA] Page loaded:', path);
        } catch (error) {
            console.error('[SPA] Error loading page:', error);
            mainContent.innerHTML = '<div style="padding: 2rem; color: red;">Error loading page. Please try again.</div>';
            mainContent.style.opacity = '1';
            mainContent.style.pointerEvents = 'auto';
            
            // Hide loader on error
            const loader = document.querySelector('.page-loader');
            if (loader) {
                loader.classList.add('hidden');
            }
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

            // Try to find main content container
            let mainContent = doc.getElementById('main-content') || 
                             doc.querySelector('[role="main"]') ||
                             doc.querySelector('main') ||
                             doc.querySelector('.main-content');

            if (!mainContent) {
                // If no main container found, extract from app div
                const appDiv = doc.getElementById('app');
                if (appDiv) {
                    // Get all children except sidebar
                    mainContent = appDiv.querySelector('div:not(#sidebar)');
                }
            }

            if (!mainContent) {
                throw new Error('Could not find main content in page');
            }

            return mainContent.innerHTML;
        } catch (error) {
            console.error('[SPA] Fetch error:', error);
            throw error;
        }
    }

    async reinitializePageScripts() {
        // Re-run any initialization scripts that need to happen on new page content
        
        // Example: If page has data-init attribute scripts
        const scripts = document.querySelectorAll('[data-init]');
        scripts.forEach(script => {
            try {
                eval(script.textContent);
            } catch (e) {
                console.warn('[SPA] Error running init script:', e);
            }
        });

        // Trigger custom event that pages can listen for
        window.dispatchEvent(new CustomEvent('spa-page-loaded', { detail: { page: this.currentPage } }));
        
        // Wait a bit for page to fully render
        return new Promise(resolve => setTimeout(resolve, 300));
    }

    // Preload a page in background
    preload(path) {
        if (!this.pageCache[path] && this.menuMapping[path]) {
            this.fetchPageContent(this.menuMapping[path].url)
                .then(content => {
                    this.pageCache[path] = content;
                    console.log('[SPA] Preloaded:', path);
                })
                .catch(e => console.warn('[SPA] Preload failed:', path, e));
        }
    }

    // Clear cache
    clearCache(path = null) {
        if (path) {
            delete this.pageCache[path];
        } else {
            this.pageCache = {};
        }
        console.log('[SPA] Cache cleared');
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
