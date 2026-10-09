// ============================================================
// Shared Sidebar Component - v5.4 - Smart Active State
// ============================================================

(function() {
    // Add scrollbar styling for sidebar - both light and dark mode
    const scrollbarStyle = document.createElement('style');
    scrollbarStyle.textContent = `
        /* Light mode scrollbar */
        #sidebar::-webkit-scrollbar,
        #sidebar nav::-webkit-scrollbar {
            width: 8px;
        }
        
        #sidebar::-webkit-scrollbar-track,
        #sidebar nav::-webkit-scrollbar-track {
            background: transparent;
        }
        
        #sidebar::-webkit-scrollbar-thumb,
        #sidebar nav::-webkit-scrollbar-thumb {
            background: rgba(100, 120, 140, 0.6);
            border-radius: 4px;
            transition: background 0.3s ease;
        }
        
        #sidebar::-webkit-scrollbar-thumb:hover,
        #sidebar nav::-webkit-scrollbar-thumb:hover {
            background: rgba(100, 120, 140, 0.8);
        }
        
        /* Dark mode scrollbar - higher specificity */
        html[data-dark-mode="true"] #sidebar::-webkit-scrollbar-thumb {
            background: rgba(75, 85, 99, 0.6) !important;
            border-radius: 4px;
        }
        
        html[data-dark-mode="true"] #sidebar nav::-webkit-scrollbar-thumb {
            background: rgba(75, 85, 99, 0.6) !important;
            border-radius: 4px;
        }
        
        html[data-dark-mode="true"] #sidebar::-webkit-scrollbar-thumb:hover {
            background: rgba(75, 85, 99, 0.8) !important;
        }
        
        html[data-dark-mode="true"] #sidebar nav::-webkit-scrollbar-thumb:hover {
            background: rgba(75, 85, 99, 0.8) !important;
        }

        /* ============ SMOOTH HOVER ANIMATIONS ============ */
        /* Sidebar menu items - smooth hover effect */
        #sidebar nav a,
        #sidebar nav button {
            position: relative;
            will-change: background-color, color, transform;
            transform-origin: center center;
            backface-visibility: hidden;
            -webkit-font-smoothing: antialiased;
            -webkit-backface-visibility: hidden;
        }

        /* Active state styling - modern & fancy (CSS only, no structure changes) */
        #sidebar nav a[data-active="true"],
        #sidebar nav button[data-active="true"],
        #sidebar nav a.active,
        #sidebar nav button.active {
            background: rgba(96, 165, 250, 0.12) !important;
            box-shadow: inset 0 2px 0 0 #60a5fa !important;
        }

        /* Dark mode active state */
        html[data-dark-mode="true"] #sidebar nav a[data-active="true"],
        html[data-dark-mode="true"] #sidebar nav button[data-active="true"],
        html[data-dark-mode="true"] #sidebar nav a.active,
        html[data-dark-mode="true"] #sidebar nav button.active {
            background: rgba(96, 165, 250, 0.15) !important;
            box-shadow: inset 0 2px 0 0 #60a5fa !important;
        }

        /* Active icon glow effect */
        #sidebar nav a[data-active="true"] span i,
        #sidebar nav button[data-active="true"] span i,
        #sidebar nav a.active span i,
        #sidebar nav button.active span i {
            opacity: 1 !important;
            color: #60a5fa !important;
        }

        /* Active text color */
        #sidebar nav a[data-active="true"],
        #sidebar nav button[data-active="true"],
        #sidebar nav a.active,
        #sidebar nav button.active {
            color: #3b82f6 !important;
            font-weight: 600 !important;
        }

        /* Dark mode active text */
        html[data-dark-mode="true"] #sidebar nav a[data-active="true"],
        html[data-dark-mode="true"] #sidebar nav button[data-active="true"],
        html[data-dark-mode="true"] #sidebar nav a.active,
        html[data-dark-mode="true"] #sidebar nav button.active {
            color: #60a5fa !important;
        }

        /* Smooth background & color transition with transform */
        #sidebar nav a,
        #sidebar nav button {
            transition: background-color 0.12s ease-out, color 0.12s ease-out, box-shadow 0.12s ease-out, transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
        }

        /* Fast icon opacity transition */
        #sidebar nav a span i,
        #sidebar nav button span i {
            transition: opacity 0.12s ease-out, color 0.12s ease-out !important;
        }

        /* Dropdown arrow smooth rotation */
        #sidebar nav .dropdown-arrow {
            transition: transform 0.2s ease-out !important;
        }

        /* Text color transition */
        #sidebar nav a span,
        #sidebar nav button span {
            transition: color 0.12s ease-out !important;
        }

        /* Hover effect for non-active items */
        #sidebar nav a:not([data-active="true"]):not(.active):hover,
        #sidebar nav button:not([data-active="true"]):not(.active):hover {
            background: rgba(0, 0, 0, 0.04) !important;
            transform: scale(1.01);
        }

        html[data-dark-mode="true"] #sidebar nav a:not([data-active="true"]):not(.active):hover,
        html[data-dark-mode="true"] #sidebar nav button:not([data-active="true"]):not(.active):hover {
            background: rgba(255, 255, 255, 0.06) !important;
            transform: scale(1.01);
        }

        /* Active state hover - brighten underline and zoom */
        #sidebar nav a[data-active="true"]:hover,
        #sidebar nav button[data-active="true"]:hover,
        #sidebar nav a.active:hover,
        #sidebar nav button.active:hover {
            background: rgba(96, 165, 250, 0.18) !important;
            box-shadow: inset 0 3px 0 0 #60a5fa !important;
            transform: scale(1.015);
        }

        html[data-dark-mode="true"] #sidebar nav a[data-active="true"]:hover,
        html[data-dark-mode="true"] #sidebar nav button[data-active="true"]:hover,
        html[data-dark-mode="true"] #sidebar nav a.active:hover,
        html[data-dark-mode="true"] #sidebar nav button.active:hover {
            background: rgba(96, 165, 250, 0.22) !important;
            box-shadow: inset 0 3px 0 0 #60a5fa !important;
            transform: scale(1.015);
        }
    `;
    document.head.appendChild(scrollbarStyle);
    
    // Better active page detection - normalize pathname
    let activePage = window.location.pathname.split('/').pop() || 'dashboard';
    // Remove .html if present
    activePage = activePage.replace('.html', '').toLowerCase();
    // If empty (home), set to dashboard
    if (!activePage || activePage === '' || activePage === '/') {
        activePage = 'dashboard';
    }
    
    const menuItems = [
        { href: '/dashboard', label: 'Dashboard', icon: '<i class="fas fa-chart-line"></i>' },
        { href: '/whatsapp-messages', label: 'Notify Zona', icon: '<i class="fas fa-bell"></i>' },
        { href: '/support-dashboard', label: 'Support', icon: '<i class="fas fa-headset"></i>' },
        { href: '/audit-logs', label: 'Audit Logs', icon: '<i class="fas fa-shield-alt"></i>' },
        { href: '/storage-handler', label: 'Storage Handler', icon: '<i class="fas fa-folder-open"></i>' },
        { href: '/token-management', label: 'Token Management', icon: '<i class="fas fa-key"></i>' },
        
        {
            isDropdown: true,
            id: 'dd-rename-tools',
            label: 'Rename Tools',
            icon: '<i class="fas fa-tools"></i>',
            children: [
                { href: '/rename-faktur', label: 'Rename Faktur', icon: '<i class="fas fa-file-invoice"></i>' },
                { href: '/pdf-to-csv', label: 'PDF to CSV', icon: '<i class="fas fa-file-export"></i>' },
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
                { href: '/users', label: 'Pengguna', icon: '<i class="fas fa-users"></i>' },
                { href: '/tokos', label: 'Toko', icon: '<i class="fas fa-store"></i>' },
                { href: '/zonas', label: 'Zona', icon: '<i class="fas fa-map-marked-alt"></i>' },
                { href: '/kendaraan', label: 'Kendaraan', icon: '<i class="fas fa-truck"></i>' },
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
                const childPath = child.href.replace('.html', '').toLowerCase().replace(/^\//, '');
                return activePage === childPath;
            });
        } else {
            // For regular items, check if it matches
            const itemPath = item.href.replace('.html', '').toLowerCase().replace(/^\//, '');
            return activePage === itemPath;
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
            container.style.transition = 'max-height 0.3s ease, opacity 0.3s ease';
            container.style.maxHeight = container.scrollHeight + 'px';
            void container.offsetHeight;
            
            requestAnimationFrame(() => {
                container.style.maxHeight = '0px';
                container.style.opacity = '0';
            });
            
            btn.setAttribute('data-expanded', 'false');
            if (icon) icon.style.transform = 'rotate(0deg)';
            
            setTimeout(() => {
                if (btn.getAttribute('data-expanded') === 'false') {
                    container.style.display = 'none';
                    container.style.pointerEvents = 'none';
                }
            }, 300);
        } else {
            // Close other dropdowns (accordion behavior)
            const allDropdownButtons = document.querySelectorAll('[id$="-btn"][data-expanded="true"]');
            allDropdownButtons.forEach(otherBtn => {
                if (otherBtn.id !== id + '-btn') {
                    const otherId = otherBtn.id.replace('-btn', '');
                    const otherContainer = document.getElementById(otherId);
                    const otherIcon = otherBtn.querySelector('.dropdown-arrow');
                    
                    if (otherContainer) {
                        otherContainer.style.transition = 'max-height 0.3s ease, opacity 0.3s ease';
                        otherContainer.style.maxHeight = otherContainer.scrollHeight + 'px';
                        void otherContainer.offsetHeight;
                        
                        requestAnimationFrame(() => {
                            otherContainer.style.maxHeight = '0px';
                            otherContainer.style.opacity = '0';
                        });
                        
                        otherBtn.setAttribute('data-expanded', 'false');
                        if (otherIcon) otherIcon.style.transform = 'rotate(0deg)';
                        
                        setTimeout(() => {
                            if (otherBtn.getAttribute('data-expanded') === 'false') {
                                otherContainer.style.display = 'none';
                                otherContainer.style.pointerEvents = 'none';
                            }
                        }, 300);
                    }
                }
            });

            // Expand current dropdown
            container.style.display = 'block';
            container.style.overflow = 'hidden';
            container.style.maxHeight = '0px';
            container.style.opacity = '0';
            void container.offsetHeight;
            
            container.style.pointerEvents = 'auto';
            container.style.transition = 'max-height 0.3s ease, opacity 0.3s ease';
            
            requestAnimationFrame(() => {
                const fullHeight = container.scrollHeight;
                container.style.maxHeight = fullHeight + 'px';
                container.style.opacity = '1';
            });
            
            btn.setAttribute('data-expanded', 'true');
            if (icon) icon.style.transform = 'rotate(180deg)';
            
            setTimeout(() => {
                if (btn.getAttribute('data-expanded') === 'true') {
                    container.style.maxHeight = 'none';
                }
            }, 300);
        }
    };

    // Global color variables for theme consistency
    let sidebarColors = {};

    function inject() {
        let sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            return;
        }

        // Always re-inject untuk update colors saat dark mode toggle
        // Clear injected attribute agar bisa di-re-render
        sidebar.removeAttribute('data-injected');

        // Check if current page is an Upload File menu item
        const uploadFilePages = ['/upload-excel', '/upload-invoice-pdf', '/upload-bukti-bayar', '/upload-faktur'];
        const isUploadFilePage = uploadFilePages.some(page => {
            const normalizedPage = page.toLowerCase();
            const normalizedPath = (window.location.pathname).toLowerCase();
            return normalizedPath === normalizedPage || normalizedPath.replace('.html', '') === normalizedPage;
        });

        // Menu item sizes - modern and consistent
        const menuSizes = {
            buttonPadding: '0.625rem 0.75rem',
            buttonMargin: '0.125rem 0',
            buttonFontSize: '0.875rem',
            childPadding: '0.5rem 0.75rem 0.5rem 2.5rem',
            childMargin: '0.125rem 0',
            childFontSize: '0.8125rem',
            childIconSize: '0.875rem',
            iconSize: '1.125rem'
        };

        // Recalculate colors based on current dark mode
        const isDarkMode = localStorage.getItem('dark_mode_enabled') === 'true';
        const bgColor = isDarkMode ? '#0f172a' : '#ffffff';
        const borderColor = isDarkMode ? '#1e293b' : '#e5e7eb';
        const textColor = isDarkMode ? '#f0f4f8' : '#2d3748';
        const secondaryText = isDarkMode ? '#cbd5e1' : '#718096';
        const tertiaryText = isDarkMode ? '#94a3b8' : '#a0aec0';
        const hoverBgColor = isDarkMode ? '#1e293b' : '#f7fafc';
        const activeBgColor = isDarkMode ? '#1e3a5f' : '#dbeafe';
        const activeTextColor = isDarkMode ? '#60a5fa' : '#0369a1';

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
                    const childPath = child.href.replace('.html', '').toLowerCase().replace(/^\//, '');
                    const isActive = activePage === childPath;
                    const childBg = isActive ? activeBgColor : 'transparent';
                    const childText = isActive ? activeTextColor : secondaryText;
                    const childWeight = isActive ? '600' : '400';
                    
                    childrenHTML += `
                        <a href="${child.href}" onclick="event.stopPropagation();" class="${isActive ? 'active' : ''}" data-active="${isActive}" style="
                            display: flex;
                            align-items: center;
                            padding: ${menuSizes.childPadding};
                            margin: ${menuSizes.childMargin};
                            border-radius: 8px;
                            font-size: ${menuSizes.childFontSize};
                            background: ${childBg};
                            color: ${childText};
                            font-weight: ${childWeight};
                            text-decoration: none;
                            transition: all 0.15s ease-out;
                            letter-spacing: -0.01em;
                        ">
                            <span style="margin-right: 0.75rem; font-size: ${menuSizes.childIconSize}; opacity: 0.7;">${child.icon}</span>
                            <span>${child.label}</span>
                        </a>
                    `;
                }

                const dropdownBg = itemIsActive ? hoverBgColor : 'transparent';
                const dropdownText = itemIsActive ? textColor : textColor;
                
                navHTML += `
                    <button id="${item.id}-btn" onclick="toggleSidebarDropdown('${item.id}')" class="${itemIsActive ? 'active' : ''}" data-expanded="${itemIsActive}" data-active="${itemIsActive}" style="
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        width: 100%;
                        padding: ${menuSizes.buttonPadding};
                        margin: ${menuSizes.buttonMargin};
                        border: none;
                        background: ${dropdownBg};
                        color: ${dropdownText};
                        text-decoration: none;
                        font-size: ${menuSizes.buttonFontSize};
                        cursor: pointer;
                        transition: all 0.15s ease-out;
                        text-align: left;
                        font-weight: 500;
                        border-radius: 8px;
                        letter-spacing: -0.01em;
                    ">
                        <span style="display: flex; align-items: center;">
                            <span style="margin-right: 0.75rem; font-size: ${menuSizes.iconSize}; opacity: 0.8;">${item.icon}</span>
                            <span>${item.label}</span>
                        </span>
                        <svg class="dropdown-arrow" width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style="opacity: 0.5; transition: transform 0.2s ease; ${itemIsActive ? 'transform: rotate(180deg);' : ''}">
                            <path d="M2 4L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                        </svg>
                    </button>
                    <div id="${item.id}" style="
                        display: ${itemIsActive ? 'block' : 'none'};
                        background: transparent;
                        max-height: ${itemIsActive ? 'none' : '0px'};
                        opacity: ${itemIsActive ? '1' : '0'};
                        overflow: hidden;
                        transition: max-height 0.3s ease, opacity 0.3s ease;
                        pointer-events: ${itemIsActive ? 'auto' : 'none'};
                        padding-left: 0.5rem;
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
                    <a href="${item.href}" class="${isActive ? 'active' : ''}" data-active="${isActive}" style="
                        display: flex;
                        align-items: center;
                        padding: ${menuSizes.buttonPadding};
                        margin: ${menuSizes.buttonMargin};
                        border-radius: 8px;
                        background: ${itemBg};
                        color: ${itemText};
                        font-weight: ${itemWeight};
                        text-decoration: none;
                        font-size: ${menuSizes.buttonFontSize};
                        cursor: pointer;
                        transition: all 0.15s ease-out;
                        letter-spacing: -0.01em;
                    ">
                        <span style="margin-right: 0.75rem; font-size: ${menuSizes.iconSize}; opacity: 0.8;">${item.icon}</span>
                        <span>${item.label}</span>
                    </a>
                `;
            }
        }

        const hasAnnouncement = !!document.getElementById('global-announcement-banner');
        const topOffset = hasAnnouncement ? '60px' : '0px';

        // Modern sidebar with consistent width
        const sidebarWidth = '15rem';

        // Use min-height: 148vh for ideal full page coverage
        const sidebarHeight = `min-height: 148vh;`;

        sidebar.style.cssText = `
            position: fixed;
            top: ${topOffset};
            left: 0;
            width: ${sidebarWidth};
            ${sidebarHeight}
            display: flex;
            flex-direction: column;
            background: ${bgColor};
            border-right: 1px solid ${borderColor};
            z-index: 9999;
            box-sizing: border-box;
            transition: background-color 0.4s ease, border-color 0.4s ease;
            will-change: background-color;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 1.5rem 1rem;
        `;

        sidebar.innerHTML = `
            <!-- Brand Header -->
            <div style="
                display: flex;
                align-items: center;
                gap: 0.75rem;
                padding: 0.5rem 0;
                margin-bottom: 2rem;
            ">
                <div style="
                    width: 40px;
                    height: 40px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                ">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="color: white;">
                        <path d="M9 3L5 7L9 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M15 13L19 17L15 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <line x1="19" y1="7" x2="5" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </div>
                <div>
                    <div style="
                        font-weight: 700;
                        font-size: 1.125rem;
                        color: ${textColor};
                        letter-spacing: -0.02em;
                        line-height: 1.2;
                    ">Arsip Anka</div>
                </div>
            </div>
            
            <nav style="
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                scroll-behavior: smooth;
            ">
                ${navHTML}
            </nav>
            
            <!-- Quick Actions Footer -->
            <div style="
                padding-top: 1.5rem;
                margin-top: 1.5rem;
                border-top: 1px solid ${borderColor};
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            ">
                <div style="
                    font-size: 0.75rem;
                    color: ${tertiaryText};
                    font-weight: 600;
                    letter-spacing: 0.05em;
                    text-transform: uppercase;
                    margin-bottom: 0.5rem;
                ">Quick Actions</div>
                
                <div style="display: flex; gap: 0.5rem;">
                    <!-- Edit Button -->
                    <button onclick="openEditHeadlineModal()" style="
                        flex: 1;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 0.625rem;
                        background: transparent;
                        color: #60a5fa;
                        border: 1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.3)' : '#60a5fa'};
                        border-radius: 8px;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.background='#60a5fa'; this.style.color='white'" onmouseout="this.style.background='transparent'; this.style.color='#60a5fa'" title="Edit headline">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </button>
                    
                    <!-- Dark Mode Toggle -->
                    <button id="dark-mode-toggle-sidebar" onclick="toggleDarkMode()" style="
                        flex: 1;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 0.625rem;
                        background: transparent;
                        color: ${isDarkMode ? '#fbbf24' : '#6b7280'};
                        border: 1px solid ${isDarkMode ? 'rgba(251, 191, 36, 0.3)' : '#d1d5db'};
                        border-radius: 8px;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    " onmouseover="const isDark = localStorage.getItem('dark_mode_enabled') === 'true'; this.style.background = isDark ? '#fbbf24' : '#6b7280'; this.style.color='white'" onmouseout="const isDark = localStorage.getItem('dark_mode_enabled') === 'true'; this.style.background='transparent'; this.style.color = isDark ? '#fbbf24' : '#6b7280'" title="Toggle theme">
                        <span style="font-size: 16px;">${isDarkMode ? '☀️' : '🌙'}</span>
                    </button>
                    
                    <!-- Logout Button -->
                    <button onclick="logout()" style="
                        flex: 1;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 0.625rem;
                        background: transparent;
                        color: #ef4444;
                        border: 1px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.3)' : '#ef4444'};
                        border-radius: 8px;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.background='#ef4444'; this.style.color='white'" onmouseout="this.style.background='transparent'; this.style.color='#ef4444'" title="Logout">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                    </button>
                </div>
            </div>
        `;

        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.style.marginLeft = '15rem';
            mainContent.style.width = 'calc(100% - 15rem)';
            mainContent.style.boxSizing = 'border-box';
            mainContent.style.transition = 'all 0.4s ease';
        }

        // Mark sidebar as injected
        sidebar.setAttribute('data-injected', 'true');
    }

    // Setup fast hover listeners for menu items
    function setupHoverListeners() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        // Get all menu links and buttons
        const menuItems = sidebar.querySelectorAll('nav a, nav button');
        
        menuItems.forEach(item => {
            // Check if has data-active="true" or class="active"
            const isActive = item.getAttribute('data-active') === 'true' || item.classList.contains('active');
            
            // Remove previous listeners (if any)
            item.removeEventListener('mouseenter', menuHoverEnter);
            item.removeEventListener('mouseleave', menuHoverLeave);
            
            // Add new listeners with isActive bound
            const enterHandler = function(e) {
                const isDarkMode = localStorage.getItem('dark_mode_enabled') === 'true';
                const itemIsActive = this.getAttribute('data-active') === 'true' || this.classList.contains('active');
                
                if (itemIsActive) {
                    // Active item - brighten with thicker underline and zoom
                    this.style.background = isDarkMode ? 'rgba(96, 165, 250, 0.22)' : 'rgba(96, 165, 250, 0.18)';
                    this.style.boxShadow = 'inset 0 3px 0 0 #60a5fa';
                    this.style.transform = 'scale(1.015)';
                } else {
                    // Non-active - show subtle hover with zoom
                    this.style.background = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)';
                    this.style.transform = 'scale(1.01)';
                }
            };
            
            const leaveHandler = function(e) {
                const isDarkMode = localStorage.getItem('dark_mode_enabled') === 'true';
                const itemIsActive = this.getAttribute('data-active') === 'true' || this.classList.contains('active');
                
                if (itemIsActive) {
                    // Restore active background with thin underline and normal scale
                    this.style.background = isDarkMode ? 'rgba(96, 165, 250, 0.15)' : 'rgba(96, 165, 250, 0.12)';
                    this.style.boxShadow = 'inset 0 2px 0 0 #60a5fa';
                    this.style.transform = 'scale(1)';
                } else {
                    // Restore transparent and normal scale
                    this.style.background = 'transparent';
                    this.style.boxShadow = 'none';
                    this.style.transform = 'scale(1)';
                }
            };
            
            item.addEventListener('mouseenter', enterHandler, { passive: true });
            item.addEventListener('mouseleave', leaveHandler, { passive: true });
        });
    }

    // Global handlers (for cleanup)
    function menuHoverEnter(e) {}
    function menuHoverLeave(e) {}

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            inject();
            setupHoverListeners();
        });
    } else {
        inject();
        setupHoverListeners();
    }

    window.loadSidebar = async function() {
        inject();
        setupHoverListeners();
        
        // Update active states for current page without full re-render
        const currentPath = window.location.pathname;
        updateActiveStates(currentPath);
        
        return Promise.resolve();
    };

    // Re-setup hover listeners when dark mode toggles
    const originalToggleDarkMode = window.toggleDarkMode;
    window.toggleDarkMode = function() {
        if (originalToggleDarkMode) {
            originalToggleDarkMode();
        }
        // Re-inject and re-setup hover listeners after dark mode change
        setTimeout(() => {
            inject();
            setupHoverListeners();
        }, 50);
    };

    // Function to update active states without full re-render
    function updateActiveStates(pathname) {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        const { textColor = '#2d3748', activeTextColor = '#1e40af', activeBgColor = '#eff6ff' } = sidebarColors;

        // Normalize pathname for comparison
        const normalizedPath = pathname.replace('.html', '').replace(/\/$/, '').toLowerCase();

        for (const item of menuItems) {
            if (item.isDropdown) {
                const btn = document.getElementById(item.id + '-btn');
                const container = document.getElementById(item.id);
                if (!btn || !container) continue;

                // Check if any child matches current path
                let itemIsActive = false;
                for (const child of item.children) {
                    const childPath = child.href.replace('.html', '').replace(/\/$/, '').toLowerCase();
                    if (normalizedPath === childPath) {
                        itemIsActive = true;
                        break;
                    }
                }

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
                } else {
                    btn.style.backgroundColor = 'transparent';
                    btn.style.color = textColor;
                    const arrow = btn.querySelector('.dropdown-arrow');
                    if (arrow) arrow.style.transform = 'rotate(0deg)';
                    container.style.display = 'none';
                    container.style.opacity = '0';
                    container.style.maxHeight = '0px';
                    btn.setAttribute('data-expanded', 'false');
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
                    
                    if (isActive) {
                        link.style.backgroundColor = activeBgColor;
                        link.style.color = activeTextColor;
                    } else {
                        link.style.backgroundColor = 'transparent';
                        link.style.color = textColor;
                    }
                }
            }
        }
    }

    // Global function accessible from other pages
    window.updateSidebarActiveState = function(pathname) {
        // Just update active states since we now use fixed width
        updateActiveStates(pathname);
        sessionStorage.setItem('sidebar_initialized', 'true');
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
    
    // Re-inject sidebar dengan color theme baru
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
}

function updateDarkModeUI() {
    const isDark = localStorage.getItem('dark_mode_enabled') === 'true';
    
    // Update header button
    const icon = document.getElementById('dark-mode-icon');
    const label = document.getElementById('dark-mode-label');
    const toggle = document.getElementById('dark-mode-toggle');
    
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
    if (label) label.textContent = isDark ? 'Light Mode' : 'Dark Mode';
    if (toggle) {
        toggle.style.transition = 'background-color 1s ease, color 1s ease, border-color 1s ease';
        toggle.style.background = isDark ? '#334155' : '#f3f4f6';
        toggle.style.color = isDark ? '#cbd5e1' : '#6b7280';
    }
    
    // Update sidebar button
    const sidebarIcon = document.getElementById('dark-mode-icon-sidebar');
    const sidebarLabel = document.getElementById('dark-mode-label-sidebar');
    const sidebarToggle = document.getElementById('dark-mode-toggle-sidebar');
    
    if (sidebarIcon) sidebarIcon.textContent = isDark ? '☀️' : '🌙';
    if (sidebarLabel) sidebarLabel.textContent = isDark ? 'Light' : 'Dark';
    if (sidebarToggle) {
        sidebarToggle.style.background = isDark ? '#475569' : '#f3f4f6';
        sidebarToggle.style.color = isDark ? '#cbd5e1' : '#6b7280';
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
