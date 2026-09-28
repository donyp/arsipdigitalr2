// ============================================================
// SPA Page Handler - Prepares pages for SPA content loading
// ============================================================

// This script should be included on ALL pages that will be loaded via SPA
// It ensures that pages have proper structure for content extraction

(function() {
    console.log('[SPA] Page handler loaded');

    // Ensure main-content div exists
    function ensureMainContentDiv() {
        let mainContent = document.getElementById('main-content');
        
        if (!mainContent) {
            // Try to find existing content container
            const app = document.getElementById('app');
            if (app) {
                // Get all non-sidebar children
                const contentArea = app.querySelector('div:not(#sidebar)');
                if (contentArea) {
                    contentArea.id = 'main-content';
                    mainContent = contentArea;
                    console.log('[SPA] Found and marked content area as main-content');
                }
            }
        }

        if (!mainContent) {
            console.warn('[SPA] No main-content found, content loading may fail');
        }

        return mainContent;
    }

    // Initialize page when loaded via SPA
    window.initializeSPAPage = function() {
        console.log('[SPA] Initializing page content');
        
        // Re-run any initialization code that needs to happen
        // This is called after content is loaded via AJAX
        
        // Re-initialize dark mode if needed
        if (window.updateDarkModeUI) {
            window.updateDarkModeUI();
        }

        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('page-initialized', { 
            detail: { timestamp: Date.now() } 
        }));
    };

    // When page first loads (not via SPA), ensure structure
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureMainContentDiv);
    } else {
        ensureMainContentDiv();
    }

    // When page is loaded via SPA
    window.addEventListener('spa-page-loaded', () => {
        console.log('[SPA] Page loaded via SPA, initializing...');
        window.initializeSPAPage();
    });
})();
