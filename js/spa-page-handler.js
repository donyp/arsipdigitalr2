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
        
        // Force Tailwind CSS to re-process new content
        // This ensures that newly added HTML elements get proper styling
        if (typeof window.tailwindcss !== 'undefined') {
            console.log('[SPA] Re-processing Tailwind CSS for new content');
            try {
                // Force a style recalculation by triggering document re-scan
                const mainContent = document.getElementById('main-content');
                if (mainContent) {
                    // Get all elements with Tailwind classes
                    const elements = mainContent.querySelectorAll('[class*="bg-"], [class*="text-"], [class*="p-"], [class*="w-"], [class*="h-"]');
                    console.log(`[SPA] Found ${elements.length} elements to style with Tailwind`);
                }
            } catch (e) {
                console.warn('[SPA] Could not process Tailwind CSS:', e.message);
            }
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
