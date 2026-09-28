// ============================================================
// Shared Sidebar Component - Complete Rebuild v5.0
// Simplified approach: No flex complexity, just scrollable list
// ============================================================

(function() {
    console.log('[Sidebar] Initializing v5.0...');
    
    const activePage = window.location.pathname.split('/').pop() || 'dashboard';
    
    const menuItems = [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/whatsapp-messages', label: 'Notify Zona' },
        { href: '/support-dashboard', label: 'Support' },
        
        {
            isDropdown: true,
            id: 'dd-rename-tools',
            label: 'Rename Tools',
            children: [
                { href: '/rename-faktur', label: 'Faktur Pajak' },
            ]
        },

        {
            isDropdown: true,
            id: 'dd-invoice',
            label: 'Upload File',
            children: [
                { href: '/upload-excel', label: 'Upload Excel' },
                { href: '/upload-invoice-pdf.html', label: 'Upload Invoice' },
                { href: '/upload-bukti-bayar', label: 'Upload Bukti Bayar' },
                { href: '/upload-faktur', label: 'Upload Faktur Pajak' },
            ]
        },
        
        {
            isDropdown: true,
            id: 'dd-manajemen',
            label: 'Manajemen',
            children: [
                { href: '/users', label: 'Manajemen Pengguna' },
                { href: '/tokos', label: 'Daftar Toko' },
                { href: '/zonas', label: 'Zona Operasional' },
            ]
        },
    ];

    window.toggleSidebarDropdown = function(id) {
        const btn = document.getElementById(id + '-btn');
        const container = document.getElementById(id);
        if (!btn || !container) return;

        const isExpanded = btn.getAttribute('data-expanded') === 'true';
        if (isExpanded) {
            container.style.display = 'none';
            btn.setAttribute('data-expanded', 'false');
        } else {
            container.style.display = 'block';
            btn.setAttribute('data-expanded', 'true');
        }
    };

    const isDarkMode = localStorage.getItem('dark_mode_enabled') === 'true';
    const bgColor = isDarkMode ? '#0f172a' : '#ffffff';
    const borderColor = isDarkMode ? '#334155' : '#e5e7eb';
    const textColor = isDarkMode ? '#e2e8f0' : '#334155';
    const hoverBgColor = isDarkMode ? '#1e293b' : '#f8fafc';
    const activeBgColor = isDarkMode ? '#1e40af' : '#e0e7ff';
    const activeTextColor = isDarkMode ? '#60a5fa' : '#4f46e5';

    let navHTML = '';

    for (const item of menuItems) {
        if (item.isDropdown) {
            const visibleChildren = item.children || [];
            const hasActiveChild = visibleChildren.some(child => activePage === child.href);
            const displayStyle = hasActiveChild ? 'block' : 'none';

            let childrenHTML = '';
            for (const child of visibleChildren) {
                const isActive = activePage === child.href;
                childrenHTML += `<a href="${child.href}" style="display: block; padding: 0.5rem 1rem 0.5rem 2.5rem; margin: 0; border: none; background: ${isActive ? activeBgColor : 'transparent'}; color: ${isActive ? activeTextColor : textColor}; text-decoration: none; font-size: 0.85rem; cursor: pointer; transition: all 0.2s; font-weight: ${isActive ? '600' : '500'};" onmouseover="this.style.backgroundColor='${hoverBgColor}'" onmouseout="this.style.backgroundColor='${isActive ? activeBgColor : 'transparent'}'">${child.label}</a>`;
            }

            navHTML += `
                <button id="${item.id}-btn" onclick="toggleSidebarDropdown('${item.id}')" data-expanded="${hasActiveChild}" style="display: block; width: 100%; padding: 0.6rem 1rem; margin: 0; border: none; background: transparent; color: ${textColor}; text-decoration: none; font-size: 0.9rem; cursor: pointer; transition: all 0.2s; text-align: left; font-weight: 500;">
                    ${item.label}
                </button>
                <div id="${item.id}" style="display: ${displayStyle}; background: transparent;">
                    ${childrenHTML}
                </div>
            `;
        } else {
            const isActive = activePage === item.href;
            navHTML += `<a href="${item.href}" style="display: block; padding: 0.6rem 1rem; margin: 0; border: none; background: ${isActive ? activeBgColor : 'transparent'}; color: ${isActive ? activeTextColor : textColor}; text-decoration: none; font-size: 0.9rem; cursor: pointer; transition: all 0.2s; font-weight: ${isActive ? '600' : '500'};" onmouseover="this.style.backgroundColor='${isActive ? activeBgColor : hoverBgColor}'" onmouseout="this.style.backgroundColor='${isActive ? activeBgColor : 'transparent'}'">${item.label}</a>`;
        }
    }

    function inject() {
        let sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            console.log('[Sidebar] No sidebar element found');
            return;
        }

        const hasAnnouncement = !!document.getElementById('global-announcement-banner');
        const topOffset = hasAnnouncement ? '60px' : '0px';

        sidebar.style.cssText = `
            position: fixed;
            top: ${topOffset};
            left: 0;
            width: 20rem;
            min-height: 130vh;
            display: flex;
            flex-direction: column;
            background: ${bgColor};
            border-right: 1px solid ${borderColor};
            z-index: 9999;
            box-sizing: border-box;
        `;

        sidebar.innerHTML = `
            <div style="padding: 1rem; border-bottom: 1px solid ${borderColor}; flex-shrink: 0;">
                <div style="font-weight: 900; font-size: 0.9rem; color: ${textColor};">ARSIP ANKA</div>
                <div style="font-size: 0.7rem; color: ${textColor}; opacity: 0.7;">Member Area</div>
            </div>
            <nav style="flex: 1; overflow-y: auto; overflow-x: hidden; padding: 0.5rem 0;">
                ${navHTML}
            </nav>
            <div style="padding: 0.75rem; border-top: 1px solid ${borderColor}; flex-shrink: 0; font-size: 0.65rem; color: ${textColor}; opacity: 0.7; text-align: center;">v3.1</div>
        `;

        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.style.marginLeft = '20rem';
            mainContent.style.width = 'calc(100% - 20rem)';
        }

        console.log('[Sidebar] v5.0 Injection complete');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }

    window.loadSidebar = async function() {
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
