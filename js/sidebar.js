// ============================================================
// Shared Sidebar Component - v5.3 - Smooth UX Experience
// ============================================================

(function() {
    console.log('[Sidebar] Initializing v5.3 - Smooth UX...');
    
    const activePage = window.location.pathname.split('/').pop() || 'dashboard';
    
    const menuItems = [
        { href: '/dashboard', label: 'Dashboard', icon: '📊' },
        { href: '/whatsapp-messages', label: 'Notify Zona', icon: '💬' },
        { href: '/support-dashboard', label: 'Support', icon: '🆘' },
        
        {
            isDropdown: true,
            id: 'dd-rename-tools',
            label: 'Rename Tools',
            icon: '🔧',
            children: [
                { href: '/rename-faktur', label: 'Faktur Pajak', icon: '📋' },
            ]
        },

        {
            isDropdown: true,
            id: 'dd-invoice',
            label: 'Upload File',
            icon: '📁',
            children: [
                { href: '/upload-excel', label: 'Upload Excel', icon: '📊' },
                { href: '/upload-invoice-pdf.html', label: 'Upload Invoice', icon: '📄' },
                { href: '/upload-bukti-bayar', label: 'Upload Bukti Bayar', icon: '💳' },
                { href: '/upload-faktur', label: 'Upload Faktur Pajak', icon: '📋' },
            ]
        },
        
        {
            isDropdown: true,
            id: 'dd-manajemen',
            label: 'Manajemen',
            icon: '⚙️',
            children: [
                { href: '/users', label: 'Manajemen Pengguna', icon: '👥' },
                { href: '/tokos', label: 'Daftar Toko', icon: '🏪' },
                { href: '/zonas', label: 'Zona Operasional', icon: '📍' },
            ]
        },
    ];

    window.toggleSidebarDropdown = function(id) {
        const btn = document.getElementById(id + '-btn');
        const container = document.getElementById(id);
        const icon = btn?.querySelector('.dropdown-arrow');
        if (!btn || !container) return;

        const isExpanded = btn.getAttribute('data-expanded') === 'true';
        
        // Smooth collapse/expand animation
        if (isExpanded) {
            container.style.maxHeight = '0px';
            container.style.opacity = '0';
            container.style.overflow = 'hidden';
            setTimeout(() => {
                container.style.display = 'none';
            }, 300);
            btn.setAttribute('data-expanded', 'false');
            if (icon) icon.style.transform = 'rotate(0deg)';
        } else {
            container.style.display = 'block';
            // Trigger reflow to start animation
            const scrollHeight = container.scrollHeight;
            container.style.maxHeight = scrollHeight + 'px';
            container.style.opacity = '1';
            btn.setAttribute('data-expanded', 'true');
            if (icon) icon.style.transform = 'rotate(180deg)';
        }
    };

    const isDarkMode = localStorage.getItem('dark_mode_enabled') === 'true';
    const bgColor = isDarkMode ? '#0f172a' : '#ffffff';
    const borderColor = isDarkMode ? '#1e293b' : '#e5e7eb';
    const textColor = isDarkMode ? '#f0f4f8' : '#2d3748';
    const secondaryText = isDarkMode ? '#cbd5e1' : '#718096';
    const tertiaryText = isDarkMode ? '#94a3b8' : '#a0aec0';
    const hoverBgColor = isDarkMode ? '#1e293b' : '#f7fafc';
    const activeBgColor = isDarkMode ? '#1e3a5f' : '#eff6ff';
    const activeTextColor = isDarkMode ? '#60a5fa' : '#1e40af';
    const activeBorder = isDarkMode ? '#3b82f6' : '#3b82f6';

    let navHTML = '';

    for (const item of menuItems) {
        if (item.isDropdown) {
            const visibleChildren = item.children || [];
            const hasActiveChild = visibleChildren.some(child => activePage === child.href);
            const maxHeightStyle = hasActiveChild ? 'auto' : '0px';
            const opacityStyle = hasActiveChild ? '1' : '0';
            const displayStyle = hasActiveChild ? 'block' : 'block';

            let childrenHTML = '';
            for (const child of visibleChildren) {
                const isActive = activePage === child.href;
                const childBg = isActive ? activeBgColor : 'transparent';
                const childText = isActive ? activeTextColor : secondaryText;
                const childWeight = isActive ? '600' : '500';
                
                childrenHTML += `
                    <a href="${child.href}" style="
                        display: flex;
                        align-items: center;
                        padding: 0.6rem 1rem 0.6rem 2.5rem;
                        margin: 0.2rem 0.6rem;
                        border-radius: 0.4rem;
                        font-size: 0.8rem;
                        background: ${childBg};
                        color: ${childText};
                        font-weight: ${childWeight};
                        text-decoration: none;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        letter-spacing: 0.01em;
                        will-change: background-color, color;
                    " onmouseover="this.style.backgroundColor='${hoverBgColor}'; this.style.color='${activeTextColor}'; this.style.transform='translateX(4px)'" onmouseout="this.style.backgroundColor='${childBg}'; this.style.color='${childText}'; this.style.transform='translateX(0)'">
                        <span style="margin-right: 0.5rem; font-size: 0.85rem; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);">${child.icon}</span><span>${child.label}</span>
                    </a>
                `;
            }

            navHTML += `
                <button id="${item.id}-btn" onclick="toggleSidebarDropdown('${item.id}')" data-expanded="${hasActiveChild}" style="
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    width: calc(100% - 1.2rem);
                    padding: 0.75rem 0.85rem;
                    margin: 0.2rem 0.6rem;
                    border: none;
                    background: transparent;
                    color: ${textColor};
                    text-decoration: none;
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    text-align: left;
                    font-weight: 600;
                    border-radius: 0.4rem;
                    letter-spacing: 0.01em;
                    will-change: background-color, color;
                " onmouseover="this.style.backgroundColor='${hoverBgColor}'; this.style.color='${activeTextColor}'" onmouseout="this.style.backgroundColor='transparent'; this.style.color='${textColor}'">
                    <span style="display: flex; align-items: center;"><span style="margin-right: 0.65rem; font-size: 0.95rem; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); will-change: transform;">${item.icon}</span>${item.label}</span>
                    <span class="dropdown-arrow" style="font-size: 0.65rem; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); will-change: transform; ${hasActiveChild ? 'transform: rotate(180deg);' : ''}">\u25BC</span>
                </button>
                <div id="${item.id}" style="
                    display: ${displayStyle};
                    background: transparent;
                    max-height: ${maxHeightStyle};
                    opacity: ${opacityStyle};
                    overflow: hidden;
                    transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    will-change: max-height, opacity;
                ">
                    ${childrenHTML}
                </div>
            `;
        } else {
            const isActive = activePage === item.href;
            const itemBg = isActive ? activeBgColor : 'transparent';
            const itemText = isActive ? activeTextColor : textColor;
            const itemWeight = isActive ? '600' : '500';
            
            navHTML += `
                <a href="${item.href}" style="
                    display: flex;
                    align-items: center;
                    padding: 0.75rem 0.85rem;
                    margin: 0.2rem 0.6rem;
                    border-radius: 0.4rem;
                    background: ${itemBg};
                    color: ${itemText};
                    font-weight: ${itemWeight};
                    text-decoration: none;
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    letter-spacing: 0.01em;
                    will-change: background-color, color, transform;
                " onmouseover="this.style.backgroundColor='${hoverBgColor}'; this.style.color='${activeTextColor}'; this.style.transform='translateX(4px)'" onmouseout="this.style.backgroundColor='${itemBg}'; this.style.color='${itemText}'; this.style.transform='translateX(0)'">
                    <span style="margin-right: 0.65rem; font-size: 0.95rem; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); will-change: transform;">${item.icon}</span>${item.label}
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

        const hasAnnouncement = !!document.getElementById('global-announcement-banner');
        const topOffset = hasAnnouncement ? '60px' : '0px';

        sidebar.style.cssText = `
            position: fixed;
            top: ${topOffset};
            left: 0;
            width: 20rem;
            min-height: 148vh;
            display: flex;
            flex-direction: column;
            background: ${bgColor};
            border-right: 1px solid ${borderColor};
            z-index: 9999;
            box-sizing: border-box;
            transition: background-color 0.4s ease, border-color 0.4s ease;
            will-change: background-color;
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
            ">v5.3</div>
        `;

        // Add smooth scroll styling for nav
        const nav = sidebar.querySelector('nav');
        if (nav) {
            nav.style.scrollBehavior = 'smooth';
        }

        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.style.marginLeft = '20rem';
            mainContent.style.width = 'calc(100% - 20rem)';
            mainContent.style.transition = 'all 0.4s ease';
        }

        console.log('[Sidebar] v5.3 Smooth UX complete');
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
