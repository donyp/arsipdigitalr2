// ============================================================
// MOBILE UTILITIES
// Helper functions for mobile-specific features
// ============================================================

(function() {
    'use strict';

    // Detect if running on mobile device
    const isMobile = () => {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
            || window.innerWidth <= 768;
    };

    // Detect if running as PWA
    const isPWA = () => {
        return window.matchMedia('(display-mode: standalone)').matches 
            || window.navigator.standalone === true;
    };

    // Initialize mobile features
    function initMobile() {
        if (!isMobile()) {
            return; // Skip mobile features on desktop
        }
        // Add mobile class to body
        document.body.classList.add('mobile-device');
        
        if (isPWA()) {
            document.body.classList.add('pwa-mode');
        }

        // Initialize mobile header
        initMobileHeader();
        
        // Initialize mobile navigation
        initBottomNav();
        
        // Initialize swipe gestures (if on list pages)
        if (document.querySelector('.swipe-container')) {
            initSwipeGestures();
        }
        
        // Initialize FAB (if on upload pages)
        initFAB();
        
        // Fix viewport for iOS
        fixIOSViewport();
        
        // Prevent zoom on input focus (iOS)
        preventZoomOnFocus();
    }

    // Create and show mobile header
    function initMobileHeader() {
        const mainContent = document.getElementById('main-content');
        const sidebar = document.getElementById('sidebar');
        
        if (!mainContent || !sidebar) return;

        // Create mobile header if it doesn't exist
        let mobileHeader = document.querySelector('.mobile-header');
        
        if (!mobileHeader) {
            mobileHeader = document.createElement('div');
            mobileHeader.className = 'mobile-header mobile-header-visible';
            mobileHeader.innerHTML = `
                <button class="hamburger-btn" id="mobile-menu-btn" aria-label="Toggle menu">
                    <span></span>
                    <span></span>
                    <span></span>
                </button>
                <h1 style="font-size: 16px; font-weight: 700; margin: 0;">Arsip Anka</h1>
                <div style="width: 44px;"></div>
            `;
            
            document.body.insertBefore(mobileHeader, document.body.firstChild);
        }

        // Create overlay
        let overlay = document.querySelector('.mobile-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'mobile-overlay';
            document.body.appendChild(overlay);
        }

        // Toggle menu
        const menuBtn = document.getElementById('mobile-menu-btn');
        
        menuBtn.addEventListener('click', () => {
            const isOpen = sidebar.classList.toggle('mobile-open');
            overlay.classList.toggle('active', isOpen);
            menuBtn.classList.toggle('active', isOpen);
            document.body.style.overflow = isOpen ? 'hidden' : '';
        });

        // Close on overlay click
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('active');
            menuBtn.classList.remove('active');
            document.body.style.overflow = '';
        });

        // Close on navigation
        sidebar.addEventListener('click', (e) => {
            if (e.target.tagName === 'A') {
                sidebar.classList.remove('mobile-open');
                overlay.classList.remove('active');
                menuBtn.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    // Initialize bottom navigation
    function initBottomNav() {
        // Check if bottom nav already exists
        if (document.querySelector('.bottom-nav')) {
            return;
        }

        const currentPage = window.location.pathname.split('/').pop() || 'dashboard';
        const userRole = localStorage.getItem('user_role') || 'admin_zona';

        // Define navigation items based on role
        const navItems = [
            { href: '/dashboard', icon: '🏠', label: 'Home', roles: ['super_admin', 'moderator', 'admin_zona'] },
            { href: '/upload', icon: '📤', label: 'Upload', roles: ['super_admin', 'moderator'] },
            { href: '/notification-settings', icon: '🔔', label: 'Notif', roles: ['super_admin', 'moderator', 'admin_zona'], badge: true },
            { href: '/users', icon: '👥', label: 'Users', roles: ['super_admin', 'moderator'] }
        ];

        // Filter items based on user role
        const visibleItems = navItems.filter(item => item.roles.includes(userRole));

        // Create bottom nav
        const bottomNav = document.createElement('nav');
        bottomNav.className = 'bottom-nav';
        
        bottomNav.innerHTML = visibleItems.map(item => {
            const isActive = currentPage === item.href;
            const badgeHTML = item.badge ? '<span class="badge" id="notif-badge-mobile">0</span>' : '';
            
            return `
                <a href="${item.href}" class="bottom-nav-item ${isActive ? 'active' : ''}">
                    <span class="icon">${item.icon}</span>
                    <span>${item.label}</span>
                    ${badgeHTML}
                </a>
            `;
        }).join('');

        document.body.appendChild(bottomNav);

        // Update notification badge
        if (typeof updateNotificationBadge === 'function') {
            updateNotificationBadge();
        }
    }

    // Initialize swipe gestures for list items
    function initSwipeGestures() {
        const swipeContainers = document.querySelectorAll('.swipe-container');
        
        swipeContainers.forEach(container => {
            let startX = 0;
            let currentX = 0;
            let isSwiping = false;

            container.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
                isSwiping = true;
            });

            container.addEventListener('touchmove', (e) => {
                if (!isSwiping) return;
                
                currentX = e.touches[0].clientX;
                const diff = startX - currentX;

                if (diff > 50) {
                    container.classList.add('swiped');
                } else if (diff < -50) {
                    container.classList.remove('swiped');
                }
            });

            container.addEventListener('touchend', () => {
                isSwiping = false;
            });
        });
    }

    // Initialize Floating Action Button
    function initFAB() {
        // Check if FAB should be shown
        const currentPage = window.location.pathname;
        const showFABPages = ['/dashboard', '/'];
        
        if (!showFABPages.some(page => currentPage.includes(page))) {
            return;
        }

        // Create FAB if it doesn't exist
        let fab = document.querySelector('.fab');
        if (!fab) {
            fab = document.createElement('button');
            fab.className = 'fab';
            fab.innerHTML = '📤';
            fab.setAttribute('aria-label', 'Upload file');
            fab.addEventListener('click', () => {
                window.location.href = '/upload';
            });
            document.body.appendChild(fab);
        }
    }

    // Fix iOS viewport issues
    function fixIOSViewport() {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        
        if (isIOS) {
            // Fix 100vh issue on iOS
            const setViewportHeight = () => {
                const vh = window.innerHeight * 0.01;
                document.documentElement.style.setProperty('--vh', `${vh}px`);
            };

            setViewportHeight();
            window.addEventListener('resize', setViewportHeight);
            window.addEventListener('orientationchange', setViewportHeight);
        }
    }

    // Prevent zoom on input focus (iOS Safari fix)
    function preventZoomOnFocus() {
        const inputs = document.querySelectorAll('input, select, textarea');
        
        inputs.forEach(input => {
            // Ensure font-size is at least 16px to prevent iOS zoom
            const currentFontSize = window.getComputedStyle(input).fontSize;
            const fontSize = parseInt(currentFontSize);
            
            if (fontSize < 16) {
                input.style.fontSize = '16px';
            }
        });
    }

    // Convert tables to card view on mobile
    function convertTableToCards() {
        const tables = document.querySelectorAll('table:not(.no-mobile-cards)');
        
        tables.forEach(table => {
            if (isMobile()) {
                table.classList.add('mobile-card-view');
                
                // Add data-label to each td
                const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent);
                const rows = table.querySelectorAll('tbody tr');
                
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    cells.forEach((cell, index) => {
                        if (headers[index]) {
                            cell.setAttribute('data-label', headers[index]);
                        }
                    });
                });
            }
        });
    }

    // Add to home screen prompt
    let deferredPrompt;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Show custom install button if needed
        showInstallPromotion();
    });

    function showInstallPromotion() {
        // Only show if not already installed
        if (isPWA()) {
            return;
        }

        // Create install banner
        const banner = document.createElement('div');
        banner.id = 'install-banner';
        banner.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 16px;
            right: 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 16px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            z-index: 98;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
        `;
        
        banner.innerHTML = `
            <div style="flex: 1;">
                <div style="font-weight: 700; margin-bottom: 4px;">📱 Install Arsip Anka</div>
                <div style="font-size: 12px; opacity: 0.9;">Install aplikasi untuk akses lebih cepat</div>
            </div>
            <button id="install-btn" style="background: white; color: #667eea; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer;">
                Install
            </button>
            <button id="dismiss-install" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer;">
                ×
            </button>
        `;
        
        document.body.appendChild(banner);

        // Install button click
        document.getElementById('install-btn').addEventListener('click', async () => {
            if (!deferredPrompt) return;
            
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            deferredPrompt = null;
            banner.remove();
        });

        // Dismiss button
        document.getElementById('dismiss-install').addEventListener('click', () => {
            banner.remove();
        });
    }

    // Register service worker
    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then((registration) => {
                    })
                    .catch((error) => {
                    });
            });
        }
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initMobile();
            convertTableToCards();
            registerServiceWorker();
        });
    } else {
        initMobile();
        convertTableToCards();
        registerServiceWorker();
    }

    // Export utilities
    window.MobileUtils = {
        isMobile,
        isPWA,
        convertTableToCards,
        initSwipeGestures
    };
})();
