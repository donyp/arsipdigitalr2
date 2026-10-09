/**
 * Sidebar Component - Clean Implementation
 * Single source of truth for sidebar styling and structure
 * All menu items render with IDENTICAL height, padding, and font-size
 */

(function() {
    console.log('[SIDEBAR] Initializing clean sidebar...');

    // ============================================================
    // MENU CONFIGURATION
    // ============================================================
    const menuConfig = [
        {
            id: 'dashboard',
            label: 'Dashboard',
            icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
            href: '/dashboard.html',
            children: []
        },
        {
            id: 'whatsapp',
            label: 'WhatsApp Messages',
            icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
            href: '/whatsapp-messages.html',
            children: []
        },
        {
            id: 'support',
            label: 'Support',
            icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><path d="M12 1v6m6 6h6m-6 6v6m-12 0h6m-6-6H1"></path><circle cx="12" cy="12" r="9"></circle></svg>',
            href: '/support-dashboard.html',
            children: []
        },
        {
            id: 'upload',
            label: 'Upload File',
            icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>',
            href: '#',
            isDropdown: true,
            children: [
                { label: 'Upload Excel', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>', href: '/upload-excel.html' },
                { label: 'Upload Invoice PDF', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="13" x2="12" y2="17"></line><line x1="10" y1="15" x2="14" y2="15"></line></svg>', href: '/upload-invoice-pdf.html' },
                { label: 'Upload Bukti Bayar', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>', href: '/upload-bukti-bayar.html' },
                { label: 'Upload Faktur Pajak', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>', href: '/upload-faktur-pajak.html' }
            ]
        },
        {
            id: 'tools',
            label: 'Tools',
            icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 1 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>',
            href: '#',
            isDropdown: true,
            children: [
                { label: 'Rename Faktur', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 16 12 12 8 16"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 7 20.3"></path></svg>', href: '/rename-faktur.html' }
            ]
        },
        {
            id: 'management',
            label: 'Management',
            icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>',
            href: '#',
            isDropdown: true,
            children: [
                { label: 'Users', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>', href: '/users.html' },
                { label: 'Tokos', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>', href: '/tokos.html' },
                { label: 'Zonas', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>', href: '/zonas.html' },
                { label: 'Kendaraan', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h-1V6c0-1-1-2-2-2H9c-1 0-2 1-2 2v2H6l-2 5v7h2v2h2v-2h8v2h2v-2h2v-7l-2-5z"></path><path d="M9 6h6v2H9z"></path></svg>', href: '/kendaraan-dashboard.html' }
            ]
        },
        {
            id: 'system',
            label: 'System',
            icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="2" y1="17" x2="22" y2="17"></line><polyline points="20 21 12 17 4 21"></polyline></svg>',
            href: '#',
            isDropdown: true,
            children: [
                { label: 'Audit Logs', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8m.31-8.86c-1.77-.45-2.34-1.16-2.34-2.27 0-1.39 1.11-2.3 2.72-2.3 1.67 0 2.52.87 2.65 2.2h1.52c-.15-1.76-1.27-2.9-2.9-3.15V5h-1.11v1.52c-1.51.15-2.66 1.09-2.66 2.23 0 .97.54 1.63 2.05 2.09 1.77.45 2.35 1.24 2.35 2.37 0 1.33-1.05 2.37-2.75 2.37-1.68 0-2.72-.88-2.88-2.4H9.7c.02 1.65 1.16 2.95 2.75 3.21v1.53h1.1v-1.52c1.65-.2 2.5-1.08 2.5-2.25h-1.52c-.12.89-.93 1.42-1.99 1.42z"></path></svg>', href: '/audit-logs.html' },
                { label: 'Storage Handler', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5.04-6.71l-2.75 3.54h2.86v2h-4v-3.2L6.5 6.5H9.86V4.5h4v2h-2.9l2.04 2.79z"></path></svg>', href: '/storage-handler.html' },
                { label: 'Token Management', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>', href: '/token-management.html' }
            ]
        }
    ];

    // ============================================================
    // UNIFIED SIZING - ALL ITEMS IDENTICAL
    // ============================================================
    const STYLES = {
        // Menu item sizing
        menuItemHeight: '2.5rem',           // Fixed height for all items
        menuItemPadding: '0.6rem 0.8rem',   // Uniform padding
        menuItemGap: '0.8rem',               // Space between icon and text
        menuItemFontSize: '0.875rem',        // 14px
        menuItemLineHeight: '1',             // No extra spacing
        
        // Icon sizing
        iconSize: '1.2rem',                  // 19.2px
        
        // Colors (light mode default)
        bgColor: '#ffffff',
        textColor: '#1f2937',
        textMutedColor: '#6b7280',
        hoverBg: 'rgba(37, 99, 235, 0.08)',
        borderColor: '#e5e7eb',
        activeTextColor: '#2563eb'
    };

    // ============================================================
    // INJECT SIDEBAR INTO DOM
    // ============================================================
    function renderSidebar() {
        console.log('[SIDEBAR] renderSidebar() called');
        
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            console.error('[SIDEBAR] ERROR: #sidebar element not found');
            return;
        }

        // Get dark mode state
        const isDarkMode = localStorage.getItem('dark_mode_enabled') === 'true';
        const colors = isDarkMode ? {
            bgColor: '#0f172a',
            textColor: '#f0f4f8',
            textMutedColor: '#cbd5e1',
            hoverBg: 'rgba(37, 99, 235, 0.15)',
            borderColor: '#1e293b',
            activeTextColor: '#60a5fa'
        } : STYLES;

        // Build menu HTML
        let menuHTML = '';
        for (const item of menuConfig) {
            if (item.isDropdown) {
                menuHTML += renderDropdown(item, colors);
            } else {
                menuHTML += renderMenuItem(item, colors);
            }
        }

        // Inject CSS into head
        injectSidebarCSS(colors);

        // Build complete sidebar HTML
        const sidebarHTML = `
            <div class="sidebar-container" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 16rem;
                height: 100vh;
                background-color: ${colors.bgColor};
                border-right: 1px solid ${colors.borderColor};
                display: flex;
                flex-direction: column;
                z-index: 9999;
                overflow: hidden;
                transition: background-color 0.3s ease, border-color 0.3s ease;
            ">
                <!-- Brand -->
                <div style="
                    padding: 1rem 0.8rem;
                    border-bottom: 1px solid ${colors.borderColor};
                    flex-shrink: 0;
                ">
                    <div style="
                        display: flex;
                        align-items: center;
                        gap: 0.8rem;
                        font-weight: 700;
                        color: ${colors.textColor};
                        font-size: 1.125rem;
                    ">
                        <div style="
                            width: 2rem;
                            height: 2rem;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            border-radius: 0.5rem;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: white;
                            font-weight: bold;
                            font-size: 1.2rem;
                        ">A</div>
                        <span>Arsip Anka</span>
                    </div>
                </div>

                <!-- Navigation Menu -->
                <nav class="sidebar-nav" style="
                    flex: 1;
                    overflow-y: auto;
                    overflow-x: hidden;
                    padding: 0.8rem 0.6rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.4rem;
                ">
                    ${menuHTML}
                </nav>

                <!-- Quick Actions Footer -->
                <div style="
                    padding: 0.8rem 0.6rem;
                    border-top: 1px solid ${colors.borderColor};
                    flex-shrink: 0;
                    display: flex;
                    gap: 0.4rem;
                ">
                    <button onclick="logout()" title="Logout" style="
                        flex: 1;
                        padding: 0.5rem;
                        background-color: #fecaca;
                        color: #7f1d1d;
                        border: none;
                        border-radius: 0.4rem;
                        cursor: pointer;
                        font-weight: 600;
                        font-size: 0.75rem;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                        Logout
                    </button>
                    <button id="dark-mode-btn" onclick="toggleDarkMode()" title="Toggle Dark Mode" style="
                        flex: 1;
                        padding: 0.5rem;
                        background-color: #dbeafe;
                        color: #0c4a6e;
                        border: none;
                        border-radius: 0.4rem;
                        cursor: pointer;
                        font-weight: 600;
                        font-size: 0.75rem;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                        ${isDarkMode ? '☀️' : '🌙'}
                    </button>
                </div>
            </div>
        `;

        sidebar.innerHTML = sidebarHTML;
        sidebar.setAttribute('data-rendered', 'true');

        // Log sidebar container width for verification
        const sidebarContainer = sidebar.querySelector('.sidebar-container');
        if (sidebarContainer) {
            console.log('[SIDEBAR] Sidebar container created:', {
                width: sidebarContainer.style.width,
                computedWidth: window.getComputedStyle(sidebarContainer).width
            });
        }

        // Adjust main content margin
        adjustMainContent();
    }

    // ============================================================
    // RENDER MENU ITEM (regular link)
    // ============================================================
    function renderMenuItem(item, colors) {
        const isActive = isMenuItemActive(item.href);
        
        return `
            <a href="${item.href}" 
                class="sidebar-item ${isActive ? 'active' : ''}" 
                style="
                    display: flex;
                    align-items: center;
                    height: ${STYLES.menuItemHeight};
                    padding: ${STYLES.menuItemPadding};
                    gap: ${STYLES.menuItemGap};
                    background-color: ${isActive ? colors.hoverBg : 'transparent'};
                    color: ${isActive ? colors.activeTextColor : colors.textColor};
                    text-decoration: none;
                    font-size: ${STYLES.menuItemFontSize};
                    line-height: ${STYLES.menuItemLineHeight};
                    border-radius: 0.5rem;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-sizing: border-box;
                    font-family: inherit;
                    font-weight: ${isActive ? 600 : 500};
                    position: relative;
                    overflow: hidden;
                    border-left: ${isActive ? '3px solid ' + colors.activeTextColor : '3px solid transparent'};
                    padding-left: calc(${STYLES.menuItemPadding.split(' ')[1]} - 3px);
                "
                onmouseover="
                    this.style.backgroundColor = '${colors.hoverBg}';
                    this.style.color = '${colors.activeTextColor}';
                    this.style.transform = 'translateX(4px)';
                    this.style.borderLeftColor = '${colors.activeTextColor}';
                "
                onmouseout="
                    const isActive = this.classList.contains('active');
                    this.style.backgroundColor = isActive ? '${colors.hoverBg}' : 'transparent';
                    this.style.color = isActive ? '${colors.activeTextColor}' : '${colors.textColor}';
                    this.style.transform = 'translateX(0)';
                    this.style.borderLeftColor = isActive ? '${colors.activeTextColor}' : 'transparent';
                "
            >
                <span style="
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: ${STYLES.iconSize};
                    height: ${STYLES.iconSize};
                    color: currentColor;
                ">
                    ${item.icon}
                </span>
                <span style="
                    flex: 1;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                ">
                    ${item.label}
                </span>
            </a>
        `;
    }

    // ============================================================
    // RENDER DROPDOWN (expandable menu)
    // ============================================================
    function renderDropdown(item, colors) {
        const isExpanded = isDropdownExpanded(item.id);
        
        let childrenHTML = '';
        for (const child of item.children) {
            const isActive = isMenuItemActive(child.href);
            childrenHTML += `
                <a href="${child.href}" 
                    class="sidebar-child-item ${isActive ? 'active' : ''}" 
                    style="
                        display: flex;
                        align-items: center;
                        height: ${STYLES.menuItemHeight};
                        padding: ${STYLES.menuItemPadding};
                        padding-left: calc(${STYLES.menuItemPadding.split(' ')[1]} + ${STYLES.iconSize} + ${STYLES.menuItemGap});
                        gap: ${STYLES.menuItemGap};
                        background-color: ${isActive ? colors.hoverBg : 'transparent'};
                        color: ${isActive ? colors.activeTextColor : colors.textMutedColor};
                        text-decoration: none;
                        font-size: ${STYLES.menuItemFontSize};
                        line-height: ${STYLES.menuItemLineHeight};
                        border-radius: 0.5rem;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        box-sizing: border-box;
                        font-family: inherit;
                        font-weight: ${isActive ? 600 : 400};
                        position: relative;
                        overflow: hidden;
                        border-left: ${isActive ? '3px solid ' + colors.activeTextColor : '3px solid transparent'};
                        padding-left: calc(${STYLES.menuItemPadding.split(' ')[1]} + ${STYLES.iconSize} + ${STYLES.menuItemGap} - 3px);
                    "
                    onmouseover="
                        this.style.backgroundColor = '${colors.hoverBg}';
                        this.style.color = '${colors.activeTextColor}';
                        this.style.transform = 'translateX(4px)';
                        this.style.borderLeftColor = '${colors.activeTextColor}';
                    "
                    onmouseout="
                        const isActive = this.classList.contains('active');
                        this.style.backgroundColor = isActive ? '${colors.hoverBg}' : 'transparent';
                        this.style.color = isActive ? '${colors.activeTextColor}' : '${colors.textMutedColor}';
                        this.style.transform = 'translateX(0)';
                        this.style.borderLeftColor = isActive ? '${colors.activeTextColor}' : 'transparent';
                    "
                >
                    <span style="
                        flex-shrink: 0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 1rem;
                        height: 1rem;
                        opacity: 0.6;
                        color: currentColor;
                    ">
                        ${child.icon}
                    </span>
                    <span style="
                        flex: 1;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    ">
                        ${child.label}
                    </span>
                </a>
            `;
        }

        return `
            <div class="sidebar-dropdown" data-dropdown-id="${item.id}">
                <button 
                    class="sidebar-dropdown-btn ${isExpanded ? 'expanded' : ''}" 
                    onclick="toggleSidebarDropdown('${item.id}')"
                    style="
                        display: flex;
                        align-items: center;
                        height: ${STYLES.menuItemHeight};
                        width: 100%;
                        padding: ${STYLES.menuItemPadding};
                        gap: ${STYLES.menuItemGap};
                        background-color: transparent;
                        color: ${colors.textColor};
                        border: none;
                        text-decoration: none;
                        font-size: ${STYLES.menuItemFontSize};
                        line-height: ${STYLES.menuItemLineHeight};
                        border-radius: 0.5rem;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        box-sizing: border-box;
                        font-family: inherit;
                        font-weight: 500;
                        position: relative;
                        overflow: hidden;
                        border-left: 3px solid transparent;
                        padding-left: calc(${STYLES.menuItemPadding.split(' ')[1]} - 3px);
                    "
                    onmouseover="
                        this.style.backgroundColor = '${colors.hoverBg}';
                        this.style.color = '${colors.activeTextColor}';
                        this.style.transform = 'translateX(4px)';
                        this.style.borderLeftColor = '${colors.activeTextColor}';
                    "
                    onmouseout="
                        this.style.backgroundColor = 'transparent';
                        this.style.color = '${colors.textColor}';
                        this.style.transform = 'translateX(0)';
                        this.style.borderLeftColor = 'transparent';
                    "
                >
                    <span style="
                        flex-shrink: 0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: ${STYLES.iconSize};
                        height: ${STYLES.iconSize};
                        color: currentColor;
                    ">
                        ${item.icon}
                    </span>
                    <span style="
                        flex: 1;
                        text-align: left;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    ">
                        ${item.label}
                    </span>
                    <svg class="dropdown-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" style="
                        flex-shrink: 0;
                        opacity: 0.6;
                        transform: ${isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'};
                        transition: transform 0.2s ease;
                    ">
                        <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>

                <div class="sidebar-dropdown-content" 
                    id="dd-${item.id}"
                    style="
                        display: flex;
                        flex-direction: column;
                        gap: 0.2rem;
                        max-height: ${isExpanded ? '500px' : '0px'};
                        opacity: ${isExpanded ? '1' : '0'};
                        overflow: hidden;
                        transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        pointer-events: ${isExpanded ? 'auto' : 'none'};
                    ">
                    ${childrenHTML}
                </div>
            </div>
        `;
    }

    // ============================================================
    // INJECT CSS INTO HEAD
    // ============================================================
    function injectSidebarCSS(colors) {
        // Check if already injected
        if (document.getElementById('sidebar-css')) return;

        const css = `
            /* Sidebar CSS */
            #sidebar {
                padding: 0 !important;
                margin: 0 !important;
                border: none !important;
                background: transparent !important;
            }

            .sidebar-nav {
                scrollbar-width: thin;
                scrollbar-color: rgba(100, 100, 100, 0.5) transparent;
            }

            .sidebar-nav::-webkit-scrollbar {
                width: 6px;
            }

            .sidebar-nav::-webkit-scrollbar-thumb {
                background: rgba(100, 100, 100, 0.5);
                border-radius: 3px;
            }

            .sidebar-nav::-webkit-scrollbar-thumb:hover {
                background: rgba(100, 100, 100, 0.8);
            }

            .sidebar-item,
            .sidebar-dropdown-btn,
            .sidebar-child-item {
                box-sizing: border-box;
            }

            .sidebar-item.active,
            .sidebar-child-item.active {
                font-weight: 600;
            }

            .sidebar-dropdown-btn.expanded .dropdown-arrow {
                transform: rotate(180deg);
            }

            #main-content {
                margin-left: 16rem;
                width: calc(100% - 16rem);
                box-sizing: border-box;
                transition: all 0.3s ease;
            }

            @media (max-width: 768px) {
                .sidebar-container {
                    display: none !important;
                }

                #main-content {
                    margin-left: 0 !important;
                    width: 100% !important;
                }
            }
        `;

        const style = document.createElement('style');
        style.id = 'sidebar-css';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ============================================================
    // HELPER FUNCTIONS
    // ============================================================
    function isMenuItemActive(href) {
        if (!href || href === '#') return false;
        
        const currentPath = window.location.pathname.toLowerCase();
        const menuPath = href.toLowerCase().replace('.html', '');
        
        return currentPath === menuPath || currentPath === menuPath + '.html' || 
               currentPath.endsWith(menuPath);
    }

    function isDropdownExpanded(dropdownId) {
        const expanded = sessionStorage.getItem(`sidebar-dropdown-${dropdownId}`);
        if (expanded === null) {
            // Check if any children are active
            const dropdown = menuConfig.find(m => m.id === dropdownId);
            if (dropdown && dropdown.children) {
                return dropdown.children.some(child => isMenuItemActive(child.href));
            }
            return false;
        }
        return expanded === 'true';
    }

    function adjustMainContent() {
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.style.marginLeft = '16rem';
            mainContent.style.width = 'calc(100% - 16rem)';
            mainContent.style.boxSizing = 'border-box';
            mainContent.style.transition = 'all 300ms ease';
            
            console.log('[SIDEBAR] adjustMainContent() - Set main-content:', {
                marginLeft: mainContent.style.marginLeft,
                width: mainContent.style.width,
                boxSizing: mainContent.style.boxSizing,
                computedWidth: window.getComputedStyle(mainContent).width,
                computedMarginLeft: window.getComputedStyle(mainContent).marginLeft
            });
        }
    }

    // ============================================================
    // GLOBAL FUNCTIONS (exposed for HTML event handlers)
    // ============================================================
    window.toggleSidebarDropdown = function(dropdownId) {
        const dropdownContent = document.getElementById(`dd-${dropdownId}`);
        if (!dropdownContent) return;

        // Get all dropdown contents
        const allDropdownContents = document.querySelectorAll('.sidebar-dropdown-content');
        
        // Check if this dropdown is currently expanded
        const isCurrentlyExpanded = parseFloat(dropdownContent.style.maxHeight) > 0;

        // Close all dropdowns with smooth animation
        allDropdownContents.forEach(content => {
            if (content.id !== `dd-${dropdownId}`) {
                // Close other dropdowns
                content.style.maxHeight = '0px';
                content.style.opacity = '0';
                content.style.pointerEvents = 'none';
                
                // Extract dropdown ID from content's id (format: dd-{dropdownId})
                const otherDropdownId = content.id.replace('dd-', '');
                
                // Update arrow rotation for button
                const btn = content.previousElementSibling;
                if (btn) {
                    const arrow = btn.querySelector('.dropdown-arrow');
                    if (arrow) {
                        arrow.style.transform = 'rotate(0deg)';
                    }
                }
                
                // Update sessionStorage for closed dropdown
                sessionStorage.removeItem(`sidebar-dropdown-${otherDropdownId}`);
            }
        });

        // Toggle current dropdown
        if (isCurrentlyExpanded) {
            // Close current dropdown
            dropdownContent.style.maxHeight = '0px';
            dropdownContent.style.opacity = '0';
            dropdownContent.style.pointerEvents = 'none';
            
            // Rotate arrow back
            const btn = dropdownContent.previousElementSibling;
            if (btn) {
                const arrow = btn.querySelector('.dropdown-arrow');
                if (arrow) {
                    arrow.style.transform = 'rotate(0deg)';
                }
            }
            
            // Update expanded state in sessionStorage
            sessionStorage.removeItem(`sidebar-dropdown-${dropdownId}`);
        } else {
            // Open current dropdown
            dropdownContent.style.maxHeight = '500px';
            dropdownContent.style.opacity = '1';
            dropdownContent.style.pointerEvents = 'auto';
            
            // Rotate arrow
            const btn = dropdownContent.previousElementSibling;
            if (btn) {
                const arrow = btn.querySelector('.dropdown-arrow');
                if (arrow) {
                    arrow.style.transform = 'rotate(180deg)';
                }
            }
            
            // Update expanded state in sessionStorage
            sessionStorage.setItem(`sidebar-dropdown-${dropdownId}`, 'true');
        }
    };

    window.toggleDarkMode = function() {
        const isDark = localStorage.getItem('dark_mode_enabled') === 'true';
        localStorage.setItem('dark_mode_enabled', String(!isDark));
        document.documentElement.setAttribute('data-dark-mode', String(!isDark));
        renderSidebar();
    };

    window.initSidebar = function() {
        console.log('[SIDEBAR] initSidebar() called');
        renderSidebar();
    };

    window.loadSidebar = function(page) {
        console.log('[SIDEBAR] loadSidebar() called for page:', page);
        renderSidebar();
    };

    // ============================================================
    // INITIALIZE ON DOM READY
    // ============================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('[SIDEBAR] DOM loaded, rendering sidebar');
            renderSidebar();
        });
    } else {
        console.log('[SIDEBAR] DOM already loaded, rendering sidebar immediately');
        renderSidebar();
    }

    // Re-render on dark mode toggle from other sources
    window.addEventListener('storage', (e) => {
        if (e.key === 'dark_mode_enabled') {
            console.log('[SIDEBAR] Dark mode changed, re-rendering');
            renderSidebar();
        }
    });

})();
