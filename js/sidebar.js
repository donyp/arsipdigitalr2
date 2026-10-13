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
            /* Pulsing Heartbeat Animation - GLOBAL */
            @keyframes heartbeat-pulse {
                0%, 100% {
                    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
                }
                50% {
                    box-shadow: 0 0 0 6px rgba(59, 130, 246, 0);
                }
            }

            /* Ensure active items have position relative for ::before */
            .sidebar-item.active,
            .sidebar-child-item.active {
                position: relative !important;
            }

            /* Active menu item with pulsing heartbeat - applies to all pages */
            .sidebar-item.active::before,
            .sidebar-child-item.active::before {
                content: '';
                position: absolute !important;
                right: 8px !important;
                top: 50% !important;
                transform: translateY(-50%) !important;
                width: 8px !important;
                height: 8px !important;
                background: #3b82f6 !important;
                border-radius: 50% !important;
                animation: heartbeat-pulse 2s infinite ease-in-out !important;
                z-index: 10 !important;
                display: block !important;
                visibility: visible !important;
            }
        `;
        
        const style = document.createElement('style');
        style.id = 'sidebar-css-global';
        style.textContent = css;
        document.head.appendChild(style);
        console.log('[SIDEBAR CSS] Global heartbeat CSS injected');
    })();

    // ============================================================
    // MENU CONFIGURATION
    // ============================================================
    const menuConfig = [
        {
            id: 'dashboard',
            label: 'Dashboard',
            icon: '<svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect></svg>',
            href: '/dashboard',
            children: []
        },
        {
            id: 'whatsapp',
            label: 'WhatsApp Messages',
            icon: '<svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
            href: '/notifikasi',
            children: []
        },
        {
            id: 'support',
            label: 'Support',
            icon: '<svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><circle cx="9" cy="10" r="1"></circle><circle cx="12" cy="10" r="1"></circle><circle cx="15" cy="10" r="1"></circle></svg>',
            href: '/support/admin',
            children: []
        },
        {
            id: 'upload',
            label: 'Upload File',
            icon: '<svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>',
            href: '#',
            isDropdown: true,
            children: [
                { label: 'Upload Excel', icon: '<svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"></path><rect x="7" y="7" width="3" height="3"></rect><rect x="14" y="7" width="3" height="3"></rect><rect x="7" y="14" width="3" height="3"></rect><rect x="14" y="14" width="3" height="3"></rect></svg>', href: '/excel' },
                { label: 'Upload Invoice PDF', icon: '<svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>', href: '/invoice' },
                { label: 'Upload Bukti Bayar', icon: '<svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline><line x1="9" y1="13" x2="15" y2="13"></line><line x1="9" y1="17" x2="15" y2="17"></line></svg>', href: '/buktibayar' },
                { label: 'Upload Faktur Pajak', icon: '<svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline><line x1="9" y1="13" x2="15" y2="13"></line></svg>', href: '/fakturpajak' }
            ]
        },
        {
            id: 'tools',
            label: 'Tools',
            icon: '<svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20"></path><circle cx="12" cy="12" r="8"></circle></svg>',
            href: '#',
            isDropdown: true,
            children: [
                { label: 'Rename Faktur', icon: '<svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>', href: '/renamefaktur' }
            ]
        },
        {
            id: 'management',
            label: 'Management',
            icon: '<svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>',
            href: '#',
            isDropdown: true,
            children: [
                { label: 'Users', icon: '<svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>', href: '/user' },
                { label: 'Tokos', icon: '<svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>', href: '/toko' },
                { label: 'Zonas', icon: '<svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>', href: '/zona' },
                { label: 'Kendaraan', icon: '<svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h1"></path><rect x="6" y="4" width="12" height="4"></rect><circle cx="9" cy="14" r="2"></circle><circle cx="15" cy="14" r="2"></circle></svg>', href: '/kendaraan' }
            ]
        },
        {
            id: 'system',
            label: 'System',
            icon: '<svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>',
            href: '#',
            isDropdown: true,
            children: [
                { label: 'Monitoring', icon: '<svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>', href: '/monitoring' },
                { label: 'Audit Logs', icon: '<svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>', href: '/logs' },
                { label: 'Storage Handler', icon: '<svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M3 5v14a9 3 0 0 0 18 0V5"></path><path d="M3 12a9 3 0 0 0 18 0"></path></svg>', href: '/penyimpanan' }
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
                z-index: 1000;
                overflow: hidden;
                transition: background-color 0.3s ease, border-color 0.3s ease;
            ">
                <!-- Brand -->
                <div style="
                    padding: 1rem 0.8rem;
                    border-bottom: 1px solid ${colors.borderColor};
                    flex-shrink: 0;
                    height: 80px;
                    display: flex;
                    align-items: center;
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

                <!-- Quick Actions Footer - HIDDEN: Moved to unified header -->
                <div style="
                    padding: 0.8rem 0.6rem;
                    border-top: 1px solid ${colors.borderColor};
                    flex-shrink: 0;
                    display: none;
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
                    box-sizing: border-box;
                    font-family: inherit;
                    font-weight: ${isActive ? 600 : 500};
                    position: relative;
                    overflow: hidden;
                    border-left: ${isActive ? '3px solid ' + colors.activeTextColor : '3px solid transparent'};
                    padding-left: calc(${STYLES.menuItemPadding.split(' ')[1]} - 3px);
                    flex-shrink: 0;
                "
                onmouseover="
                    this.style.backgroundColor = '${colors.hoverBg}';
                    this.style.color = '${colors.activeTextColor}';
                    this.style.borderLeftColor = '${colors.activeTextColor}';
                "
                onmouseout="
                    const isActive = this.classList.contains('active');
                    this.style.backgroundColor = isActive ? '${colors.hoverBg}' : 'transparent';
                    this.style.color = isActive ? '${colors.activeTextColor}' : '${colors.textColor}';
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
                        this.style.borderLeftColor = '${colors.activeTextColor}';
                    "
                    onmouseout="
                        const isActive = this.classList.contains('active');
                        this.style.backgroundColor = isActive ? '${colors.hoverBg}' : 'transparent';
                        this.style.color = isActive ? '${colors.activeTextColor}' : '${colors.textMutedColor}';
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
                        box-sizing: border-box;
                        font-family: inherit;
                        font-weight: 500;
                        position: relative;
                        overflow: hidden;
                        border-left: 3px solid transparent;
                        padding-left: calc(${STYLES.menuItemPadding.split(' ')[1]} - 3px);
                        flex-shrink: 0;
                    "
                    onmouseover="
                        this.style.backgroundColor = '${colors.hoverBg}';
                        this.style.color = '${colors.activeTextColor}';
                        this.style.borderLeftColor = '${colors.activeTextColor}';
                    "
                    onmouseout="
                        this.style.backgroundColor = 'transparent';
                        this.style.color = '${colors.textColor}';
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
                    ">
                        <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>

                <div class="sidebar-dropdown-content ${isExpanded ? 'active' : ''}" 
                    id="dd-${item.id}"
                    style="
                        display: flex;
                        flex-direction: column;
                        gap: 0.2rem;
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
            /* SVG Icon Styling - Light Gray Color */
            .sidebar-icon {
                width: 1.2rem;
                height: 1.2rem;
                stroke: #a0aec0;
                stroke-linecap: round;
                stroke-linejoin: round;
                transition: all 0.3s ease;
                flex-shrink: 0;
            }

            .sidebar-item:hover .sidebar-icon,
            .sidebar-dropdown-btn:hover .sidebar-icon {
                stroke: #6b7280;
            }

            .sidebar-item.active .sidebar-icon,
            .sidebar-child-item.active .sidebar-icon {
                stroke: #3b82f6;
            }

            /* Pulsing Heartbeat Animation */
            @keyframes heartbeat-pulse {
                0%, 100% {
                    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
                }
                50% {
                    box-shadow: 0 0 0 6px rgba(59, 130, 246, 0);
                }
            }

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
                display: flex;
                flex-direction: column;
                min-height: 0;
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
                flex-shrink: 0;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                transform: translateX(0);
                will-change: transform;
            }

            /* Active menu item with pulsing heartbeat */
            .sidebar-item.active::before,
            .sidebar-child-item.active::before {
                content: '';
                position: absolute;
                right: 8px;
                top: 50%;
                transform: translateY(-50%);
                width: 8px;
                height: 8px;
                background: #3b82f6;
                border-radius: 50%;
                animation: heartbeat-pulse 2s infinite ease-in-out;
            }

            .sidebar-item.active,
            .sidebar-child-item.active {
                position: relative;
                font-weight: 600;
            }

            /* Smooth hover animation - only for non-active items */
            .sidebar-item:hover:not(.active),
            .sidebar-dropdown-btn:hover:not(.expanded) {
                transform: translateX(4px);
            }

            /* Dropdown button expanded state */
            .sidebar-dropdown-btn.expanded {
                transform: translateX(0);
            }

            .sidebar-dropdown-btn.expanded .dropdown-arrow {
                transform: rotate(180deg);
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }

            .sidebar-dropdown-content {
                display: flex;
                flex-direction: column;
                max-height: 0;
                opacity: 0;
                overflow: hidden;
                transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }

            .sidebar-dropdown-content.active {
                max-height: 500px;
                opacity: 1;
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
        const currentFile = currentPath.split('/').pop().replace('.html', '');
        
        // Extract filename/path from href
        const hrefFile = href.toLowerCase().split('/').pop().replace('.html', '');
        
        // Multiple comparison methods
        const isActive = 
            currentPath === href ||  // Exact match
            currentPath === href + '.html' ||  // With .html
            currentPath.includes('/' + hrefFile) ||  // Include as segment
            currentFile === hrefFile ||  // Same filename
            (href.includes('support') && currentFile.includes('support')) ||  // Any support pages
            (href.includes('dashboard') && currentFile.includes('dashboard')) ||  // Any dashboard pages
            (href.includes('whatsapp') && currentFile.includes('whatsapp'));  // Any whatsapp pages
        
        if (isActive) {
            console.log('[SIDEBAR] Active menu:', href, 'Current:', currentPath, 'Match:', isActive);
        }
        
        return isActive;
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
        const newDarkState = !isDark;
        localStorage.setItem('dark_mode_enabled', String(newDarkState));
        document.documentElement.setAttribute('data-dark-mode', String(newDarkState));
        
        // Apply CSS variables immediately
        if (window.applyDarkModeInlineStyles) {
            window.applyDarkModeInlineStyles(newDarkState);
        }
        
        // Add transition class for smooth animation
        document.documentElement.classList.remove('no-transition');
        document.documentElement.classList.add('with-transitions');
        
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
