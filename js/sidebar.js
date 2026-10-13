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
            icon: '<i class="fas fa-th-large"></i>',
            href: '/dashboard',
            children: []
        },
        {
            id: 'whatsapp',
            label: 'WhatsApp Messages',
            icon: '<i class="fab fa-whatsapp"></i>',
            href: '/notifikasi',
            children: []
        },
        {
            id: 'support',
            label: 'Support',
            icon: '<i class="fas fa-headset"></i>',
            href: '/support/admin',
            children: []
        },
        {
            id: 'upload',
            label: 'Upload File',
            icon: '<i class="fas fa-cloud-upload-alt"></i>',
            href: '#',
            isDropdown: true,
            children: [
                { label: 'Upload Excel', icon: '<i class="fas fa-file-excel"></i>', href: '/excel' },
                { label: 'Upload Invoice PDF', icon: '<i class="fas fa-file-pdf"></i>', href: '/invoice' },
                { label: 'Upload Bukti Bayar', icon: '<i class="fas fa-receipt"></i>', href: '/buktibayar' },
                { label: 'Upload Faktur Pajak', icon: '<i class="fas fa-file-invoice"></i>', href: '/fakturpajak' }
            ]
        },
        {
            id: 'tools',
            label: 'Tools',
            icon: '<i class="fas fa-wrench"></i>',
            href: '#',
            isDropdown: true,
            children: [
                { label: 'Rename Faktur', icon: '<i class="fas fa-edit"></i>', href: '/renamefaktur' }
            ]
        },
        {
            id: 'management',
            label: 'Management',
            icon: '<i class="fas fa-cog"></i>',
            href: '#',
            isDropdown: true,
            children: [
                { label: 'Users', icon: '<i class="fas fa-users"></i>', href: '/user' },
                { label: 'Tokos', icon: '<i class="fas fa-store"></i>', href: '/toko' },
                { label: 'Zonas', icon: '<i class="fas fa-map-marker-alt"></i>', href: '/zona' },
                { label: 'Kendaraan', icon: '<i class="fas fa-truck"></i>', href: '/kendaraan' }
            ]
        },
        {
            id: 'system',
            label: 'System',
            icon: '<i class="fas fa-server"></i>',
            href: '#',
            isDropdown: true,
            children: [
                { label: 'Monitoring', icon: '<i class="fas fa-tachometer-alt"></i>', href: '/monitoring' },
                { label: 'Audit Logs', icon: '<i class="fas fa-history"></i>', href: '/logs' },
                { label: 'Storage Handler', icon: '<i class="fas fa-database"></i>', href: '/penyimpanan' }
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
