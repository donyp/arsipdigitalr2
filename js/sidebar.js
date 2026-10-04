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
    `;
    document.head.appendChild(scrollbarStyle);
    
    const activePage = window.location.pathname.split('/').pop() || 'dashboard';
    
    const menuItems = [
        { href: '/dashboard', label: 'Dashboard', icon: '<i class="fas fa-chart-line"></i>' },
        { href: '/whatsapp-messages', label: 'Notify Zona', icon: '<i class="fas fa-bell"></i>' },
        { href: '/support-dashboard', label: 'Support', icon: '<i class="fas fa-headset"></i>' },
        { href: '/audit-logs', label: 'Audit Logs', icon: '<i class="fas fa-shield-alt"></i>' },
        
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
            // Step 1: Set transition first
            container.style.transition = 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
            
            // Step 2: Set current height explicitly
            container.style.maxHeight = container.scrollHeight + 'px';
            
            // Step 3: Force reflow
            void container.offsetHeight;
            
            // Step 4: Animate to closed
            requestAnimationFrame(() => {
                container.style.maxHeight = '0px';
                container.style.opacity = '0';
            });
            
            btn.setAttribute('data-expanded', 'false');
            if (icon) icon.style.transform = 'rotate(0deg)';
            
            // Hide after animation completes
            setTimeout(() => {
                if (btn.getAttribute('data-expanded') === 'false') {
                    container.style.display = 'none';
                    container.style.pointerEvents = 'none';
                }
            }, 350);
        } else {
            // Close all other dropdowns first (accordion behavior)
            const allDropdownButtons = document.querySelectorAll('[id$="-btn"][data-expanded="true"]');
            allDropdownButtons.forEach(otherBtn => {
                if (otherBtn.id !== id + '-btn') {
                    const otherId = otherBtn.id.replace('-btn', '');
                    const otherContainer = document.getElementById(otherId);
                    const otherIcon = otherBtn.querySelector('.dropdown-arrow');
                    
                    if (otherContainer) {
                        // Close animation
                        // Step 1: Set transition first
                        otherContainer.style.transition = 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
                        
                        // Step 2: Set current height
                        otherContainer.style.maxHeight = otherContainer.scrollHeight + 'px';
                        
                        // Step 3: Force reflow
                        void otherContainer.offsetHeight;
                        
                        // Step 4: Animate to closed
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
                        }, 350);
                    }
                }
            });

            // Expand animation for current dropdown
            // Step 1: Show container but keep it hidden
            container.style.display = 'block';
            container.style.pointerEvents = 'auto';
            container.style.overflow = 'hidden';
            container.style.maxHeight = '0px';
            container.style.opacity = '0';
            
            // Step 2: Force browser to apply the initial state
            void container.offsetHeight;
            
            // Step 3: Set transition AFTER initial state is applied
            container.style.transition = 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
            
            // Step 4: Use requestAnimationFrame to ensure transition is ready
            requestAnimationFrame(() => {
                // Get the full height of content
                const fullHeight = container.scrollHeight;
                
                // Animate to full height
                container.style.maxHeight = fullHeight + 'px';
                container.style.opacity = '1';
            });
            
            btn.setAttribute('data-expanded', 'true');
            if (icon) icon.style.transform = 'rotate(180deg)';
            
            // Set to auto after animation for responsive content
            setTimeout(() => {
                if (btn.getAttribute('data-expanded') === 'true') {
                    container.style.maxHeight = 'none';
                    // Keep overflow hidden to prevent content from overflowing nav container
                    // container.style.overflow = 'visible';
                }
            }, 350);
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

        // Menu item sizes - smaller for upload file pages
        const menuSizes = isUploadFilePage ? {
            buttonPadding: '0.5rem 0.6rem',
            buttonMargin: '0.15rem 0.3rem',
            buttonFontSize: '0.8rem',
            childPadding: '0.4rem 0.6rem 0.4rem 2.2rem',
            childMargin: '0.1rem 0.2rem',
            childFontSize: '0.7rem',
            childIconSize: '0.8rem',
            iconSize: '0.85rem'
        } : {
            buttonPadding: '0.75rem 1rem',
            buttonMargin: '0.2rem 0.6rem',
            buttonFontSize: '0.9rem',
            childPadding: '0.6rem 1rem 0.6rem 3rem',
            childMargin: '0.15rem 0.4rem',
            childFontSize: '0.82rem',
            childIconSize: '0.88rem',
            iconSize: '1rem'
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
                    const childPath = child.href.replace('.html', '');
                    const currentPath = activePage.replace('.html', '');
                    const isActive = currentPath === childPath || activePage === child.href;
                    const childBg = isActive ? activeBgColor : 'transparent';
                    const childText = isActive ? activeTextColor : secondaryText;
                    const childWeight = isActive ? '600' : '500';
                    
                    childrenHTML += `
                        <a href="${child.href}" onclick="event.stopPropagation();" style="
                            display: flex;
                            align-items: center;
                            padding: ${menuSizes.childPadding};
                            margin: ${menuSizes.childMargin};
                            border-radius: 0.3rem;
                            font-size: ${menuSizes.childFontSize};
                            background: ${childBg};
                            color: ${childText};
                            font-weight: ${childWeight};
                            text-decoration: none;
                            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                            letter-spacing: 0.01em;
                            will-change: background-color, color;
                        " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                            <span style="margin-right: 0.6rem; font-size: ${menuSizes.childIconSize}; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);">${child.icon}</span><span>${child.label}</span>
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
                        padding: ${menuSizes.buttonPadding};
                        margin: ${menuSizes.buttonMargin};
                        border: none;
                        background: ${dropdownBg};
                        color: ${dropdownText};
                        text-decoration: none;
                        font-size: ${menuSizes.buttonFontSize};
                        cursor: pointer;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        text-align: left;
                        font-weight: 600;
                        border-radius: 0.4rem;
                        letter-spacing: 0.01em;
                        will-change: background-color, color;
                    " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                        <span style="display: flex; align-items: center;"><span style="margin-right: 0.8rem; font-size: ${menuSizes.iconSize}; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); will-change: transform;">${item.icon}</span>${item.label}</span>
                        <span class="dropdown-arrow" style="font-size: 0.75rem; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); will-change: transform; ${itemIsActive ? 'transform: rotate(180deg);' : ''}">\u25BC</span>
                    </button>
                    <div id="${item.id}" style="
                        display: ${itemIsActive ? 'block' : 'none'};
                        background: transparent;
                        max-height: ${itemIsActive ? 'none' : '0px'};
                        opacity: ${itemIsActive ? '1' : '0'};
                        overflow: hidden;
                        transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1);
                        will-change: max-height, opacity;
                        pointer-events: ${itemIsActive ? 'auto' : 'none'};
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
                        padding: ${menuSizes.buttonPadding};
                        margin: ${menuSizes.buttonMargin};
                        border-radius: 0.4rem;
                        background: ${itemBg};
                        color: ${itemText};
                        font-weight: ${itemWeight};
                        text-decoration: none;
                        font-size: ${menuSizes.buttonFontSize};
                        cursor: pointer;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        letter-spacing: 0.01em;
                        will-change: background-color, color, transform;
                    " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                        <span style="margin-right: 0.8rem; font-size: ${menuSizes.iconSize}; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); will-change: transform;">${item.icon}</span>${item.label}
                    </a>
                `;
            }
        }

        const hasAnnouncement = !!document.getElementById('global-announcement-banner');
        const topOffset = hasAnnouncement ? '60px' : '0px';

        // Use smaller width for upload file pages, normal width for others
        const sidebarWidth = isUploadFilePage ? '13rem' : '16rem';

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
                padding: 1rem 0.8rem;
                border-top: 1px solid ${borderColor};
                flex-shrink: 0;
                display: flex;
                flex-direction: column;
                gap: 0.6rem;
                transition: border-color 0.4s ease;
            ">
                <div style="
                    font-size: 0.7rem;
                    color: ${tertiaryText};
                    text-align: center;
                    font-weight: 700;
                    letter-spacing: 0.05em;
                    text-transform: uppercase;
                    transition: color 0.4s ease;
                    margin-bottom: 0.2rem;
                ">Quick Actions</div>
                <div style="
                    display: flex;
                    flex-direction: row;
                    gap: 0.5rem;
                    justify-content: center;
                ">
                <!-- Edit Button -->
                <button onclick="openEditHeadlineModal()"
                    style="
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 0.75rem;
                        background: transparent;
                        color: #60a5fa;
                        border: 1px solid #60a5fa;
                        border-radius: 0.5rem;
                        font-size: 0.9rem;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        white-space: nowrap;
                    "
                    onmouseover="this.style.background='#60a5fa'; this.style.color='white'; this.style.transform='translateY(-1px)'"
                    onmouseout="this.style.background='transparent'; this.style.color='#60a5fa'; this.style.transform='translateY(0)'"
                    title="Edit headline banner text">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" style="width: 18px; height: 18px;">
                        <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                </button>
                
                <!-- Dark Mode Toggle -->
                <button id="dark-mode-toggle-sidebar" onclick="toggleDarkMode()"
                    style="
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 0.75rem;
                        background: transparent;
                        color: ${isDarkMode ? '#fbbf24' : '#6b7280'};
                        border: 1px solid ${isDarkMode ? '#fbbf24' : '#6b7280'};
                        border-radius: 0.5rem;
                        font-size: 0.9rem;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        white-space: nowrap;
                    "
                    onmouseover="const isDark = localStorage.getItem('dark_mode_enabled') === 'true'; this.style.background = isDark ? '#fbbf24' : '#6b7280'; this.style.color='white'; this.style.transform='translateY(-1px)'"
                    onmouseout="const isDark = localStorage.getItem('dark_mode_enabled') === 'true'; this.style.background='transparent'; this.style.color = isDark ? '#fbbf24' : '#6b7280'; this.style.transform='translateY(0)'"
                    title="Toggle dark/light mode">
                    <span id="dark-mode-icon-sidebar" style="font-size: 18px;">${isDarkMode ? '☀️' : '🌙'}</span>
                </button>
                
                <!-- Logout Button -->
                <button onclick="logout()"
                    style="
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 0.75rem;
                        background: transparent;
                        color: #ef4444;
                        border: 1px solid #ef4444;
                        border-radius: 0.5rem;
                        font-size: 0.9rem;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        white-space: nowrap;
                    "
                    onmouseover="this.style.background='#ef4444'; this.style.color='white'; this.style.transform='translateY(-1px)'"
                    onmouseout="this.style.background='transparent'; this.style.color='#ef4444'; this.style.transform='translateY(0)'"
                    title="Logout from system">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" style="width: 18px; height: 18px;">
                        <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                </button>
                </div>
            </div>
        `;

        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.style.marginLeft = sidebarWidth;
            mainContent.style.width = `calc(100% - ${sidebarWidth})`;
            mainContent.style.boxSizing = 'border-box';
            mainContent.style.transition = 'all 0.4s ease';
        }

        // Mark sidebar as injected
        sidebar.setAttribute('data-injected', 'true');
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
        const uploadFilePages = ['/upload-excel', '/upload-invoice-pdf', '/upload-bukti-bayar', '/upload-faktur', '/rename-faktur'];
        const isUploadFilePage = uploadFilePages.some(page => {
            const normalizedPage = page.toLowerCase();
            const normalizedPath = pathname.toLowerCase();
            return normalizedPath === normalizedPage || normalizedPath.replace('.html', '') === normalizedPage;
        });

        // Check current sidebar width
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            const currentWidth = sidebar.style.width;
            const expectedWidth = isUploadFilePage ? '13rem' : '16rem';
            
            // If width doesn't match, we need to re-inject
            if (currentWidth !== expectedWidth) {
                inject();
                return;
            }
        }

        // Otherwise just update active states
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
