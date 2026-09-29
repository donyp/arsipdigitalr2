// ============================================================
// Shared Sidebar Component - v5.4 - Smart Active State
// ============================================================

(function() {
    console.log('[Sidebar] Initializing v5.6 - Persistent & Consistent...');
    
    const activePage = window.location.pathname.split('/').pop() || 'dashboard';
    
    const menuItems = [
        { href: '/dashboard', label: 'Dashboard', icon: '<i class="fas fa-chart-line"></i>' },
        { href: '/whatsapp-messages', label: 'Notify Zona', icon: '<i class="fas fa-bell"></i>' },
        { href: '/support-dashboard', label: 'Support', icon: '<i class="fas fa-headset"></i>' },
        
        {
            isDropdown: true,
            id: 'dd-rename-tools',
            label: 'Rename Tools',
            icon: '<i class="fas fa-tools"></i>',
            children: [
                { href: '/rename-faktur', label: 'Faktur Pajak', icon: '<i class="fas fa-file-invoice"></i>' },
            ]
        },

        {
            isDropdown: true,
            id: 'dd-invoice',
            label: 'Upload File',
            icon: '<i class="fas fa-cloud-upload-alt"></i>',
            children: [
                { href: '/upload-excel', label: 'Upload Excel', icon: '<i class="fas fa-file-excel"></i>' },
                { href: '/upload-invoice-pdf', label: 'Upload Invoice', icon: '<i class="fas fa-file-pdf"></i>' },
                { href: '/upload-bukti-bayar', label: 'Upload Bukti Bayar', icon: '<i class="fas fa-receipt"></i>' },
                { href: '/upload-faktur', label: 'Upload Faktur Pajak', icon: '<i class="fas fa-file-invoice-dollar"></i>' },
            ]
        },
        
        {
            isDropdown: true,
            id: 'dd-manajemen',
            label: 'Manajemen',
            icon: '<i class="fas fa-cog"></i>',
            children: [
                { href: '/users', label: 'Manajemen Pengguna', icon: '<i class="fas fa-users"></i>' },
                { href: '/tokos', label: 'Daftar Toko', icon: '<i class="fas fa-store"></i>' },
                { href: '/zonas', label: 'Zona Operasional', icon: '<i class="fas fa-map-marked-alt"></i>' },
            ]
        },
    ];

    // Helper to safely inject HTML icons
    function safeIcon(iconHTML) {
        // For Font Awesome icons stored as HTML strings
        if (typeof iconHTML === 'string' && iconHTML.includes('<i class="fas')) {
            return iconHTML;
        }
        // Fallback
        return '<i class="fas fa-question-circle"></i>';
    }
    function isItemActive(item) {
        if (item.isDropdown) {
            // Check if any child matches current page
            return item.children.some(child => {
                const childPath = child.href.replace('.html', '');
                const currentPath = activePage.replace('.html', '');
                return currentPath === childPath || activePage === child.href;
            });
        } else {
            // For regular items, check if it matches
            const itemPath = item.href.replace('.html', '');
            const currentPath = activePage.replace('.html', '');
            return currentPath === itemPath || activePage === item.href;
        }
    }

    window.toggleSidebarDropdown = function(id) {
        const btn = document.getElementById(id + '-btn');
        const container = document.getElementById(id);
        const icon = btn?.querySelector('.dropdown-arrow');
        if (!btn || !container) return;

        const isExpanded = btn.getAttribute('data-expanded') === 'true';
        
        if (isExpanded) {
            // Collapse animation
            container.style.maxHeight = container.scrollHeight + 'px';
            // Force reflow
            void container.offsetHeight;
            // Animate to closed
            container.style.maxHeight = '0px';
            container.style.opacity = '0';
            btn.setAttribute('data-expanded', 'false');
            if (icon) icon.style.transform = 'rotate(0deg)';
            
            // Hide after animation completes
            setTimeout(() => {
                if (btn.getAttribute('data-expanded') === 'false') {
                    container.style.display = 'none';
                }
            }, 350);
        } else {
            // Expand animation
            container.style.display = 'block';
            container.style.overflow = 'hidden';
            
            // Get the full height of content
            const fullHeight = container.scrollHeight;
            
            // Start from 0
            container.style.maxHeight = '0px';
            container.style.opacity = '0';
            
            // Force reflow to apply initial state
            void container.offsetHeight;
            
            // Animate to full height
            container.style.maxHeight = fullHeight + 'px';
            container.style.opacity = '1';
            
            btn.setAttribute('data-expanded', 'true');
            if (icon) icon.style.transform = 'rotate(180deg)';
            
            // Set to auto after animation for responsive content
            setTimeout(() => {
                if (btn.getAttribute('data-expanded') === 'true') {
                    container.style.maxHeight = 'none';
                    container.style.overflow = 'visible';
                }
            }, 350);
        }
    };

    // Global color variables for theme consistency
    let sidebarColors = {};

    function inject() {
        let sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            console.log('[Sidebar] No sidebar element found');
            return;
        }

        // Recalculate colors based on current dark mode
        const isDarkMode = localStorage.getItem('dark_mode_enabled') === 'true';
        const bgColor = isDarkMode ? '#0f172a' : '#ffffff';
        const borderColor = isDarkMode ? '#1e293b' : '#e5e7eb';
        const textColor = isDarkMode ? '#f0f4f8' : '#2d3748';
        const secondaryText = isDarkMode ? '#cbd5e1' : '#718096';
        const tertiaryText = isDarkMode ? '#94a3b8' : '#a0aec0';
        const hoverBgColor = isDarkMode ? '#1e293b' : '#f7fafc';
        const activeBgColor = isDarkMode ? '#1e3a5f' : '#eff6ff';
        const activeTextColor = isDarkMode ? '#60a5fa' : '#1e40af';

        // Store in global for updateActiveStates to use
        sidebarColors = { bgColor, borderColor, textColor, secondaryText, tertiaryText, hoverBgColor, activeBgColor, activeTextColor };

        // Generate navigation HTML with current colors
        let navHTML = '';

        for (const item of menuItems) {
            if (item.isDropdown) {
                const visibleChildren = item.children || [];
                const itemIsActive = isItemActive(item);

                let childrenHTML = '';
                for (const child of visibleChildren) {
                    const childPath = child.href.replace('.html', '');
                    const currentPath = activePage.replace('.html', '');
                    const isActive = currentPath === childPath || activePage === child.href;
                    const childBg = isActive ? activeBgColor : 'transparent';
                    const childText = isActive ? activeTextColor : secondaryText;
                    const childWeight = isActive ? '600' : '500';
                    
                    childrenHTML += `
                        <a href="${child.href}" style="
                            display: flex;
                            align-items: center;
                            padding: 0.7rem 1rem 0.7rem 2.5rem;
                            margin: 0.25rem 0.4rem;
                            border-radius: 0.3rem;
                            font-size: 0.85rem;
                            background: ${childBg};
                            color: ${childText};
                            font-weight: ${childWeight};
                            text-decoration: none;
                            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                            letter-spacing: 0.01em;
                            will-change: background-color, color;
                        " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                            <span style="margin-right: 0.6rem; font-size: 0.95rem; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);">${child.icon}</span><span>${child.label}</span>
                        </a>
                    `;
                }

                const dropdownBg = activeBgColor;
                const dropdownText = itemIsActive ? activeTextColor : textColor;
                
                navHTML += `
                    <button id="${item.id}-btn" onclick="toggleSidebarDropdown('${item.id}')" data-expanded="${itemIsActive}" style="
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        width: calc(100% - 1.2rem);
                        padding: 1rem 1rem;
                        margin: 0.3rem 0.6rem;
                        border: none;
                        background: ${dropdownBg};
                        color: ${dropdownText};
                        text-decoration: none;
                        font-size: 1rem;
                        cursor: pointer;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        text-align: left;
                        font-weight: 600;
                        border-radius: 0.4rem;
                        letter-spacing: 0.01em;
                        will-change: background-color, color;
                    " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                        <span style="display: flex; align-items: center;"><span style="margin-right: 0.8rem; font-size: 1.1rem; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); will-change: transform;">${item.icon}</span>${item.label}</span>
                        <span class="dropdown-arrow" style="font-size: 0.75rem; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); will-change: transform; ${itemIsActive ? 'transform: rotate(180deg);' : ''}">\u25BC</span>
                    </button>
                    <div id="${item.id}" style="
                        display: ${itemIsActive ? 'block' : 'none'};
                        background: transparent;
                        max-height: ${itemIsActive ? 'none' : '0px'};
                        opacity: ${itemIsActive ? '1' : '0'};
                        overflow: ${itemIsActive ? 'visible' : 'hidden'};
                        transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1);
                        will-change: max-height, opacity;
                    ">
                        ${childrenHTML}
                    </div>
                `;
            } else {
                const isActive = isItemActive(item);
                const itemBg = isActive ? activeBgColor : 'transparent';
                const itemText = isActive ? activeTextColor : textColor;
                const itemWeight = isActive ? '600' : '500';
                
                navHTML += `
                    <a href="${item.href}" style="
                        display: flex;
                        align-items: center;
                        padding: 1rem 1rem;
                        margin: 0.3rem 0.6rem;
                        border-radius: 0.4rem;
                        background: ${itemBg};
                        color: ${itemText};
                        font-weight: ${itemWeight};
                        text-decoration: none;
                        font-size: 1rem;
                        cursor: pointer;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        letter-spacing: 0.01em;
                        will-change: background-color, color, transform;
                    " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                        <span style="margin-right: 0.8rem; font-size: 1.1rem; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); will-change: transform;">${item.icon}</span>${item.label}
                    </a>
                `;
            }
        }

        const hasAnnouncement = !!document.getElementById('global-announcement-banner');
        const topOffset = hasAnnouncement ? '60px' : '0px';

        sidebar.style.cssText = `
            position: fixed;
            top: ${topOffset};
            left: 0;
            width: 20rem;
            min-height: 152vh;
            display: flex;
            flex-direction: column;
            background: ${bgColor};
            border-right: 1px solid ${borderColor};
            z-index: 9999;
            box-sizing: border-box;
            transition: background-color 0.4s ease, border-color 0.4s ease;
            will-change: background-color;
            height: auto;
        `;

        sidebar.innerHTML = `
            <div style="
                padding: 1.5rem 1.2rem;
                border-bottom: 1px solid ${borderColor};
                flex-shrink: 0;
                transition: border-color 0.4s ease;
            ">
                <div style="
                    font-weight: 900;
                    font-size: 0.95rem;
                    color: ${textColor};
                    letter-spacing: 0.15em;
                    text-transform: uppercase;
                    transition: color 0.4s ease;
                ">Arsip Anka</div>
                <div style="
                    font-size: 0.65rem;
                    color: ${tertiaryText};
                    margin-top: 0.35rem;
                    font-weight: 600;
                    letter-spacing: 0.05em;
                    text-transform: uppercase;
                    transition: color 0.4s ease;
                ">Admin Panel</div>
            </div>
            <nav style="
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 1rem 0;
                scroll-behavior: smooth;
                transition: background-color 0.4s ease;
            ">
                ${navHTML}
            </nav>
            <div style="
                padding: 1rem 1.2rem;
                border-top: 1px solid ${borderColor};
                flex-shrink: 0;
                font-size: 0.6rem;
                color: ${tertiaryText};
                text-align: center;
                font-weight: 700;
                letter-spacing: 0.05em;
                text-transform: uppercase;
                transition: border-color 0.4s ease, color 0.4s ease;
            ">v5.4</div>
        `;

        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.style.marginLeft = '20rem';
            mainContent.style.width = 'calc(100% - 20rem)';
            mainContent.style.transition = 'all 0.4s ease';
        }

        console.log('[Sidebar] v5.4 Smooth UX complete');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }

    window.loadSidebar = async function() {
        inject();
        
        // Update active states for current page without full re-render
        const currentPath = window.location.pathname;
        updateActiveStates(currentPath);
        
        return Promise.resolve();
    };

    // Function to update active states without full re-render
    function updateActiveStates(pathname) {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            console.error('[Sidebar] ERROR: sidebar element not found!');
            return;
        }

        const { textColor = '#2d3748', activeTextColor = '#1e40af', activeBgColor = '#eff6ff' } = sidebarColors;

        // Normalize pathname for comparison
        const normalizedPath = pathname.replace('.html', '').replace(/\/$/, '').toLowerCase();
        
        console.log('='.repeat(60));
        console.log('[Sidebar] *** updateActiveStates CALLED ***');
        console.log('[Sidebar] Input pathname:', JSON.stringify(pathname));
        console.log('[Sidebar] Normalized path:', JSON.stringify(normalizedPath));
        console.log('[Sidebar] Menu items count:', menuItems.length);
        console.log('[Sidebar] menuItems:', JSON.stringify(menuItems.map(m => ({
            id: m.id,
            label: m.label,
            href: m.href,
            isDropdown: m.isDropdown,
            childrenCount: m.children ? m.children.length : 0,
            children: m.children ? m.children.map(c => ({ label: c.label, href: c.href })) : []
        }))));

        for (const item of menuItems) {
            if (item.isDropdown) {
                const btn = document.getElementById(item.id + '-btn');
                const container = document.getElementById(item.id);
                if (!btn || !container) {
                    console.warn('[Sidebar] ⚠️ Dropdown button/container not found for:', item.label, '(ID:', item.id + ')');
                    continue;
                }

                // Check if any child matches current path
                let itemIsActive = false;
                console.log('[Sidebar] Checking dropdown:', item.label, '- checking', item.children.length, 'children');
                
                for (const child of item.children) {
                    const childPath = child.href.replace('.html', '').replace(/\/$/, '').toLowerCase();
                    const isMatch = normalizedPath === childPath;
                    console.log('[Sidebar]   ├─ Child:', child.label, '| href:', child.href, '| normalized:', childPath, '| MATCH:', isMatch);
                    
                    if (isMatch) {
                        itemIsActive = true;
                        console.log('[Sidebar] ✓✓✓ FOUND ACTIVE CHILD:', child.label, 'in dropdown:', item.label);
                        break;
                    }
                }

                console.log('[Sidebar] └─ Dropdown', item.label, '- RESULT isActive:', itemIsActive);

                // Update button color and state
                if (itemIsActive) {
                    btn.style.backgroundColor = activeBgColor;
                    btn.style.color = activeTextColor;
                    const arrow = btn.querySelector('.dropdown-arrow');
                    if (arrow) arrow.style.transform = 'rotate(180deg)';
                    // Auto-open dropdown when child is active
                    container.style.display = 'block';
                    container.style.opacity = '1';
                    container.style.maxHeight = 'none';
                    container.style.overflow = 'visible';
                    btn.setAttribute('data-expanded', 'true');
                    console.log('[Sidebar] ✓ HIGHLIGHTED and OPENED dropdown:', item.label);
                } else {
                    btn.style.backgroundColor = 'transparent';
                    btn.style.color = textColor;
                    const arrow = btn.querySelector('.dropdown-arrow');
                    if (arrow) arrow.style.transform = 'rotate(0deg)';
                    container.style.display = 'none';
                    container.style.opacity = '0';
                    container.style.maxHeight = '0px';
                    btn.setAttribute('data-expanded', 'false');
                    console.log('[Sidebar] ✓ CLOSED dropdown:', item.label);
                }

                // Highlight active child item
                for (const child of item.children) {
                    const childLink = sidebar.querySelector(`a[href="${child.href}"]`);
                    if (childLink) {
                        const childPath = child.href.replace('.html', '').replace(/\/$/, '').toLowerCase();
                        const isChildActive = normalizedPath === childPath;
                        
                        if (isChildActive) {
                            childLink.style.backgroundColor = activeBgColor;
                            childLink.style.color = activeTextColor;
                            console.log('[Sidebar] ✓ HIGHLIGHTED child link:', child.label);
                        } else {
                            childLink.style.backgroundColor = 'transparent';
                            childLink.style.color = textColor;
                        }
                    }
                }
            } else {
                // Regular menu item
                const link = sidebar.querySelector(`a[href="${item.href}"]`);
                if (link) {
                    const itemPath = item.href.replace('.html', '').replace(/\/$/, '').toLowerCase();
                    const isActive = normalizedPath === itemPath;
                    
                    console.log('[Sidebar] Regular item:', item.label, '| href:', item.href, '| itemPath:', itemPath, '| isActive:', isActive);
                    
                    if (isActive) {
                        link.style.backgroundColor = activeBgColor;
                        link.style.color = activeTextColor;
                        console.log('[Sidebar] ✓ HIGHLIGHTED regular item:', item.label);
                    } else {
                        link.style.backgroundColor = 'transparent';
                        link.style.color = textColor;
                    }
                }
            }
        }
        console.log('[Sidebar] *** updateActiveStates COMPLETE ***');
        console.log('='.repeat(60));
    }

    // Global function accessible from other pages
    window.updateSidebarActiveState = function(pathname) {
        console.log('🔴 GLOBAL updateSidebarActiveState called with pathname:', pathname);
        console.log('🔴 updateActiveStates function exists:', typeof updateActiveStates === 'function');
        updateActiveStates(pathname);
        sessionStorage.setItem('sidebar_initialized', 'true');
        console.log('🔴 updateSidebarActiveState completed');
    };

})();


// ============================================================
// DARK MODE IMPLEMENTATION
// ============================================================

function toggleDarkMode() {
    const isDark = localStorage.getItem('dark_mode_enabled') === 'true';
    const newState = !isDark;
    
    const html = document.documentElement;
    html.classList.remove('with-transitions');
    html.classList.add('no-transition');
    
    localStorage.setItem('dark_mode_enabled', newState ? 'true' : 'false');
    
    if (newState) {
        html.setAttribute('data-dark-mode', 'true');
    } else {
        html.removeAttribute('data-dark-mode');
    }
    
    // Reload sidebar with new colors
    if (window.loadSidebar) {
        window.loadSidebar();
    }
    
    updateDarkModeUI();
    
    if (window.applyDarkModeInlineStyles) {
        window.applyDarkModeInlineStyles(newState);
    }
    
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
        toggle.style.transition = 'background-color 1s ease, color 1s ease, border-color 1s ease';
        toggle.style.background = isDark ? '#334155' : '#f3f4f6';
        toggle.style.color = isDark ? '#cbd5e1' : '#6b7280';
        toggle.style.borderColor = isDark ? '#475569' : '#e5e7eb';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateDarkModeUI);
} else {
    updateDarkModeUI();
}

window.addEventListener('storage', (e) => {
    if (e.key === 'dark_mode_enabled') {
        const isDark = e.newValue === 'true';
        if (isDark) {
            document.documentElement.setAttribute('data-dark-mode', 'true');
        } else {
            document.documentElement.removeAttribute('data-dark-mode');
        }
        updateDarkModeUI();
        
        if (window.applyDarkModeInlineStyles) {
            window.applyDarkModeInlineStyles(isDark);
        }
    }
});
