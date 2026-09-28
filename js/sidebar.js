// ============================================================
// Shared Sidebar Component - Modern & Compact Design
// Version 4.0.0 - Clean, compact, no cutoff
// ============================================================

(function() {
    console.log('[Sidebar] Initializing...');
    
    const activePage = window.location.pathname.split('/').pop() || 'dashboard';
    
    const menuItems = [
        { href: '/dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
        { href: '/whatsapp-messages', label: 'Notify Zona', icon: 'M12 8c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm0 2c-1.657 0-3 1.343-3 3v2h6v-2c0-1.657-1.343-3-3-3zm6 5.5c.829 0 1.5.671 1.5 1.5s-.671 1.5-1.5 1.5-1.5-.671-1.5-1.5.671-1.5 1.5-1.5z' },
        { href: '/support-dashboard', label: 'Support', icon: 'M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z' },
        
        {
            isDropdown: true,
            id: 'dd-rename-tools',
            label: 'Rename Tools',
            icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 0v2m0-2a2 2 0 100 4m0-4a2 2 0 110 4m0 4v2m0-6V4',
            children: [
                { href: '/rename-faktur', label: 'Faktur Pajak', icon: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12' },
            ]
        },

        {
            isDropdown: true,
            id: 'dd-invoice',
            label: 'Upload File',
            icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
            children: [
                { href: '/upload-excel', label: 'Upload Excel', icon: 'M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
                { href: '/upload-invoice-pdf.html', label: 'Upload Invoice', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
                { href: '/upload-bukti-bayar', label: 'Upload Bukti Bayar', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
                { href: '/upload-faktur', label: 'Upload Faktur Pajak', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
            ]
        },
        
        {
            isDropdown: true,
            id: 'dd-manajemen',
            label: 'Manajemen',
            icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
            children: [
                { href: '/users', label: 'Manajemen Pengguna', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
                { href: '/tokos', label: 'Daftar Toko', icon: 'M19 21V5a2 2 0 012-2H9a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
                { href: '/zonas', label: 'Zona Operasional', icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z' },
            ]
        },
    ];

    function renderIcon(iconStr) {
        if (!iconStr) return '';
        return `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${iconStr}" />`;
    }

    window.toggleSidebarDropdown = function(id) {
        const container = document.getElementById(id);
        const parent = document.getElementById(id + '-parent');
        if (!container || !parent) return;

        const isExpanded = parent.classList.contains('expanded');
        if (isExpanded) {
            container.style.maxHeight = '0px';
            parent.classList.remove('expanded');
        } else {
            container.style.maxHeight = container.scrollHeight + 'px';
            parent.classList.add('expanded');
        }
    };

    // Check if dark mode is enabled
    const isDarkMode = localStorage.getItem('dark_mode_enabled') === 'true';
    const bgColor = isDarkMode ? '#0f172a' : '#ffffff';
    const borderColor = isDarkMode ? '#334155' : '#e5e7eb';
    const textColor = isDarkMode ? '#e2e8f0' : '#334155';
    const secondaryTextColor = isDarkMode ? '#94a3b8' : '#7c8597';
    const hoverBgColor = isDarkMode ? '#1e293b' : '#f8fafc';
    const activeBgColor = isDarkMode ? '#1e40af' : '#e0e7ff';
    const activeTextColor = isDarkMode ? '#60a5fa' : '#4f46e5';
    const dropdownBgColor = isDarkMode ? '#020617' : '#f9fafb';

    let navHTML = '';

    for (const item of menuItems) {
        if (item.isDropdown) {
            const visibleChildren = item.children || [];
            const hasActiveChild = visibleChildren.some(child => activePage === child.href);
            const maxH = hasActiveChild ? '500px' : '0px';

            let childrenHTML = '';
            for (const child of visibleChildren) {
                const isActive = activePage === child.href;
                childrenHTML += `
                    <a href="${child.href}" style="display: flex; align-items: center; padding: 0.35rem 0.7rem 0.35rem 2.4rem; margin: 0; border-radius: 0.35rem; font-size: 0.74rem; ${isActive ? `color: ${activeTextColor}; background: ${activeBgColor}; font-weight: 600;` : `color: ${secondaryTextColor};`} text-decoration: none; width: calc(100% - 0.3rem); margin-left: 0.15rem; box-sizing: border-box; display: flex; align-items: center; height: 1.8rem; transition: all 0.2s;">
                        <svg style="width: 0.68rem; height: 0.68rem; flex-shrink: 0; margin-right: 0.4rem; opacity: 0.6;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            ${renderIcon(child.icon)}
                        </svg>
                        <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${child.label}</span>
                    </a>
                `;
            }

            navHTML += `
                <div id="${item.id}-parent" style="padding: 0; margin: 0;">
                    <button onclick="toggleSidebarDropdown('${item.id}')" style="width: 100%; display: block; padding: 0.4rem 0.7rem; border-radius: 0.35rem; font-size: 0.78rem; color: ${textColor}; border: none; background: transparent; cursor: pointer; font-weight: 500; height: 1.95rem; line-height: 1; transition: all 0.2s; margin: 0.1rem 0; box-sizing: border-box; text-align: left;">
                        <svg style="width: 0.85rem; height: 0.85rem; flex-shrink: 0; margin-right: 0.55rem; opacity: 0.7; display: inline-block; vertical-align: middle;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            ${renderIcon(item.icon)}
                        </svg>
                        <span style="display: inline-block; vertical-align: middle; margin-right: 0.2rem;">${item.label}</span>
                        <svg class="sidebar-dropdown-icon" style="width: 0.68rem; height: 0.68rem; opacity: 0.4; transition: transform 300ms; flex-shrink: 0; display: inline-block; vertical-align: middle; float: right; margin-top: 0.2rem;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </button>
                    <div id="${item.id}" class="sidebar-dropdown-content" style="max-height: ${maxH}; overflow: hidden; transition: max-height 250ms ease-out; padding: 0.2rem 0;">
                        ${childrenHTML}
                    </div>
                </div>
            `;
        } else {
            const isActive = activePage === item.href;
            navHTML += `
                <a href="${item.href}" style="display: block; padding: 0.4rem 0.7rem; border-radius: 0.35rem; font-size: 0.78rem; color: ${isActive ? activeTextColor : textColor}; background: ${isActive ? activeBgColor : 'transparent'}; text-decoration: none; font-weight: ${isActive ? '600' : '500'}; height: 1.95rem; line-height: 1; transition: all 0.2s; margin: 0.1rem 0.15rem; box-sizing: border-box; text-align: left;" onmouseover="this.style.backgroundColor='${isActive ? activeBgColor : hoverBgColor}'" onmouseout="this.style.backgroundColor='${isActive ? activeBgColor : 'transparent'}'">
                    <svg style="width: 0.85rem; height: 0.85rem; flex-shrink: 0; margin-right: 0.55rem; opacity: ${isActive ? '1' : '0.7'}; display: inline-block; vertical-align: middle;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        ${renderIcon(item.icon)}
                    </svg>
                    <span style="display: inline-block; vertical-align: middle;">${item.label}</span>
                </a>
            `;
        }
    }

    function inject() {
        let sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            console.log('[Sidebar] No sidebar element found');
            return;
        }

        console.log('[Sidebar] Injecting...');

        const hasAnnouncement = !!document.getElementById('global-announcement-banner');
        const topOffset = hasAnnouncement ? '60px' : '0px';

        sidebar.style.cssText = `
            position: fixed;
            top: ${topOffset};
            left: 0;
            width: 16rem;
            ${hasAnnouncement ? `height: calc(100vh - ${topOffset});` : 'height: 100vh;'}
            display: flex;
            flex-direction: column;
            background: ${bgColor};
            border-right: 1px solid ${borderColor};
            z-index: 9999;
            box-sizing: border-box;
            transition: background 0.3s, border-color 0.3s;
            bottom: 0;
        `;

        // Debug: Log the actual sidebar height
        setTimeout(() => {
            const nav = sidebar.querySelector('nav');
            console.log('[Sidebar Debug]', {
                sidebarHeight: sidebar.offsetHeight,
                sidebarComputedHeight: window.getComputedStyle(sidebar).height,
                navHeight: nav ? nav.offsetHeight : 'N/A',
                hasAnnouncement: hasAnnouncement,
                topOffset: topOffset
            });
        }, 100);

        sidebar.innerHTML = `
            <!-- Header Logo Section -->
            <div style="padding: 1rem 0.75rem; border-bottom: 1px solid ${borderColor}; flex-shrink: 0;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <div style="width: 2rem; height: 2rem; border-radius: 0.5rem; background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <svg style="width: 1rem; height: 1rem; color: white;" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-9h10v2H7z"/>
                        </svg>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <h1 style="font-size: 0.75rem; font-weight: 800; color: ${textColor}; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; line-height: 1;">ARSIP</h1>
                        <span style="font-size: 0.6rem; color: ${secondaryTextColor}; font-weight: 600; letter-spacing: 0.02em; display: block;">ANKA</span>
                    </div>
                </div>
            </div>

            <!-- Navigation Menu - Scrollable (flex to fill) -->
            <nav style="flex: 1; overflow-y: scroll; overflow-x: hidden; padding: 0.3rem 0.4rem; width: 100%; box-sizing: border-box; min-height: 0;">
                ${navHTML}
            </nav>

            <!-- Footer Area -->
            <div style="padding: 0.5rem 0.75rem; border-top: 1px solid ${borderColor}; flex-shrink: 0; font-size: 0.55rem; color: ${secondaryTextColor}; text-align: center; font-weight: 600; letter-spacing: 0.05em;">v3.1</div>
        `;

        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.style.marginLeft = '16rem';
            mainContent.style.width = 'calc(100% - 16rem)';
        }

        console.log('[Sidebar] Injection complete');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('[Sidebar] DOMContentLoaded');
            inject();
        });
    } else {
        console.log('[Sidebar] Document ready');
        inject();
    }

    window.loadSidebar = async function(currentPage) {
        console.log(`[Sidebar] loadSidebar called for page: ${currentPage}`);
        inject();
        return Promise.resolve();
    };

})();


// ============================================================
// DARK MODE IMPLEMENTATION
// ============================================================

function toggleDarkMode() {
    const isDark = localStorage.getItem('dark_mode_enabled') === 'true';
    const newState = !isDark;
    
    // Temporarily disable transitions, toggle, then re-enable
    const html = document.documentElement;
    html.classList.remove('with-transitions');
    html.classList.add('no-transition');
    
    localStorage.setItem('dark_mode_enabled', newState ? 'true' : 'false');
    
    if (newState) {
        html.setAttribute('data-dark-mode', 'true');
    } else {
        html.removeAttribute('data-dark-mode');
    }
    
    updateDarkModeUI();
    
    // Apply inline style dark mode changes
    if (window.applyDarkModeInlineStyles) {
        window.applyDarkModeInlineStyles(newState);
    }
    
    // Re-enable transitions after a brief moment
    setTimeout(() => {
        html.classList.remove('no-transition');
        html.classList.add('with-transitions');
    }, 10);
    
    console.log('[DarkMode] Toggled to:', newState ? 'Dark' : 'Light');
}

function updateDarkModeUI() {
    const isDark = localStorage.getItem('dark_mode_enabled') === 'true';
    const icon = document.getElementById('dark-mode-icon');
    const label = document.getElementById('dark-mode-label');
    const toggle = document.getElementById('dark-mode-toggle');
    
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
    if (label) label.textContent = isDark ? 'Light Mode' : 'Dark Mode';
    if (toggle) {
        // Use CSS transitions for smooth color changes
        toggle.style.transition = 'background-color 1s ease, color 1s ease, border-color 1s ease';
        toggle.style.background = isDark ? '#334155' : '#f3f4f6';
        toggle.style.color = isDark ? '#cbd5e1' : '#6b7280';
        toggle.style.borderColor = isDark ? '#475569' : '#e5e7eb';
    }
}

// Initialize dark mode UI on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateDarkModeUI);
} else {
    updateDarkModeUI();
}

// Listen for dark mode changes from other tabs/windows
window.addEventListener('storage', (e) => {
    if (e.key === 'dark_mode_enabled') {
        const isDark = e.newValue === 'true';
        if (isDark) {
            document.documentElement.setAttribute('data-dark-mode', 'true');
        } else {
            document.documentElement.removeAttribute('data-dark-mode');
        }
        updateDarkModeUI();
        
        // Apply inline style dark mode changes
        if (window.applyDarkModeInlineStyles) {
            window.applyDarkModeInlineStyles(isDark);
        }
    }
});
