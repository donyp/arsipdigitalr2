/**
 * Reset Browser Zoom to 100%
 * Automatically resets zoom level when page loads or user navigates
 * Prevents white space and ensures consistent display
 */

(function() {
    'use strict';
    
    // Reset zoom on page load
    function resetZoom() {
        // Method 1: Using CSS zoom (affects entire page)
        document.documentElement.style.zoom = '100%';
        document.body.style.zoom = '100%';
        
        // Method 2: Reset viewport scale via meta tag
        const metaViewport = document.querySelector('meta[name="viewport"]');
        if (metaViewport) {
            metaViewport.setAttribute('content', 
                'width=device-width, initial-scale=1.0, user-scalable=yes');
        }
    }
    
    // Reset on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', resetZoom);
    } else {
        resetZoom();
    }
    
    // Also reset on window load to ensure it sticks
    window.addEventListener('load', resetZoom);
    
    // Reset on visibility change (when tab becomes visible)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            setTimeout(resetZoom, 100);
        }
    });
    
    // Reset on window resize (zoom might reset on resize)
    window.addEventListener('resize', () => {
        setTimeout(resetZoom, 50);
    });
    
    // Prevent user zoom from changing layout
    document.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            resetZoom();
        }
    }, { passive: false });
    
    // Keyboard zoom prevention (Ctrl+/-, Cmd+/)
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '0')) {
            e.preventDefault();
            resetZoom();
        }
    });
})();
