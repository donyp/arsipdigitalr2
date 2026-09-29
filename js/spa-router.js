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
            '/upload-invoice-pdf': { url: 'upload-invoice-pdf.html', title: 'Upload Invoice PDF' },
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
                    document.body.classList.add('loading-state');
                    document.documentElement.classList.add('loading-state');
                    console.log('[SPA] Loader shown on first load');
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
                console.log('[SPA] Loaded from cache:', path);
            } else {
                pageData = await this.fetchPageContent(pageConfig.url);
                this.pageCache[path] = pageData;
                console.log('[SPA] Fetched from server:', path);
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
                
                console.log('[SPA] Injecting', pageStyles.length, 'styles from page');
                pageStyles.forEach((styleData, index) => {
                    const styleEl = document.createElement('style');
                    styleEl.textContent = styleData.textContent;
                    styleEl.setAttribute('data-spa-page-style', 'true');
                    styleEl.setAttribute('data-page', path);
                    document.head.appendChild(styleEl);
                    console.log('[SPA] Injected style', index + 1);
                });
            }

            // Separate inline scripts from external scripts in pageScripts array
            const inlineScripts = pageScripts.filter(s => !s.src);
            const externalScripts = pageScripts.filter(s => s.src);
            
            console.log('[SPA] Processing ' + inlineScripts.length + ' inline scripts and ' + externalScripts.length + ' external scripts');

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
                    console.log('[SPA] Skipping already-loaded script:', scriptName);
                    continue;
                }
                
                // Skip common third-party libraries
                if (scriptData.src.includes('jquery') || 
                    scriptData.src.includes('bootstrap') ||
                    scriptData.src.includes('cdn.tailwindcss') ||
                    scriptData.src.includes('xlsx') ||
                    scriptData.src.includes('chart') ||
                    scriptData.src.includes('sweetalert')) {
                    console.log('[SPA] Skipping third-party library script:', scriptName);
                    continue;
                }
                
                // For truly global app scripts (config, api, auth, utils, etc), DON'T reload them
                // These load once on first page and persist
                const globalAppScripts = ['config.js', 'api.js', 'auth.js', 'utils.js', 'supabase.js', 'auto-logout.js', 'sidebar.js', 'spa-page-handler.js', 'global-announcement.js'];
                if (globalAppScripts.some(name => scriptPath.includes(name))) {
                    console.log('[SPA] Skipping global app script (already loaded):', scriptName);
                    continue;
                }
                
                try {
                    const script = document.createElement('script');
                    script.src = scriptData.src;
                    script.async = false;
                    await new Promise((resolve, reject) => {
                        script.onload = resolve;
                        script.onerror = reject;
                        document.body.appendChild(script);
                    });
                    console.log('[SPA] Loaded external script:', scriptData.src);
                } catch (e) {
                    console.warn('[SPA] Error loading external script:', scriptData.src, e);
                }
            }

            // Execute inline scripts after content and external scripts
            // These scripts define functions and set up event listeners
            for (const scriptData of inlineScripts) {
                try {
                    const newScript = document.createElement('script');
                    newScript.textContent = scriptData.textContent;
                    document.body.appendChild(newScript);
                    console.log('[SPA] Executed inline script');
                    // Wait for script to fully execute before next one
                    await new Promise(resolve => setTimeout(resolve, 50));
                } catch (e) {
                    console.warn('[SPA] Error executing inline script:', e);
                }
            }

            // Wait for page to stabilize after scripts
            await new Promise(resolve => setTimeout(resolve, 500));

            // Dispatch spa-page-loaded event to notify page-specific scripts
            // This triggers initialization in pages that listen for this event
            console.log('[SPA] Dispatching spa-page-loaded event');
            window.dispatchEvent(new CustomEvent('spa-page-loaded', {
                detail: { page: path }
            }));
            
            // Wait for page-specific initialization to complete
            // This is crucial - pages need time to fetch data and render
            await new Promise(resolve => setTimeout(resolve, 1000));

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
                document.body.classList.remove('loading-state');
                document.documentElement.classList.remove('loading-state');
                
                // Remove loader from DOM after animation
                setTimeout(() => {
                    if (loader && loader.parentNode) {
                        loader.remove();
                    }
                }, 500);
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

            // Strategy 1: Look for main-content div (if page uses spa-page-handler)
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
                    // Strategy 3: Get body content
                    mainContent = doc.body;
                }
            }

            if (!mainContent) {
                throw new Error('Could not find main content in page');
            }

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

            console.log('[SPA] Found ' + scriptData.length + ' scripts in page:', url);
            console.log('[SPA] Found ' + styleData.length + ' styles in page:', url);

            // Return both HTML, script data, and style data
            return {
                html: mainContent.innerHTML,
                scripts: scriptData,
                styles: styleData
            };
        } catch (error) {
            console.error('[SPA] Fetch error:', error);
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
                console.warn('[SPA] Error running init script:', e);
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
                    console.log('[SPA] Executed inline script from page');
                    document.body.removeChild(newScript);
                } catch (e) {
                    console.warn('[SPA] Error running inline script:', e);
                }
            });
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
