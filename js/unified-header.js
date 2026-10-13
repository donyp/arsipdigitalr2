/**
 * Unified Header Component
 * Provides consistent top header across all pages
 * Features: Greeting, Date/Time, Search, Action buttons
 */

function createUnifiedHeader(options = {}) {
    const {
        showSearch = true,
        showRefresh = true,
        showDarkMode = true,
        showMaintenance = true,
        showLogout = true,
        customButtons = [],
        searchPlaceholder = 'Search...'
    } = options;

    // Create header container
    const header = document.createElement('div');
    header.id = 'unified-header';
    header.className = 'unified-header';
    
    const headerHTML = `
        <div class="unified-header-content">
            <!-- Left: Greeting Section -->
            <div class="header-left">
                <div class="greeting-section">
                    <h2 class="greeting-text">
                        <span class="greeting-prefix">Selamat</span>
                        <span class="greeting-time">Pagi</span>,&nbsp;
                        <span class="user-name" data-user-name>User</span>
                        <span class="greeting-emoji">👋</span>
                    </h2>
                    <p class="greeting-subtitle">Kelola semua arsip digital disini</p>
                </div>
            </div>

            <!-- Center: Search Bar -->
            ${showSearch ? `
            <div class="header-center">
                <div class="search-box">
                    <i class="fas fa-search"></i>
                    <input 
                        type="text" 
                        class="search-input" 
                        placeholder="${searchPlaceholder}"
                        id="header-search"
                    >
                    <kbd class="search-hint">⌘K</kbd>
                </div>
            </div>
            ` : ''}

            <!-- Right: Action Buttons -->
            <div class="header-right">
                ${showRefresh ? `
                <button class="header-btn refresh-btn" title="Refresh page" onclick="location.reload()">
                    <i class="fas fa-sync-alt"></i>
                </button>
                ` : ''}
                
                ${showDarkMode ? `
                <button class="header-btn dark-mode-btn" id="header-dark-toggle" title="Toggle dark/light mode">
                    <i class="fas fa-moon"></i>
                </button>
                ` : ''}

                ${showMaintenance ? `
                <button class="header-btn maintenance-btn" id="header-maintenance-btn" title="Maintenance Mode" onclick="goToMaintenance()">
                    <i class="fas fa-tools"></i>
                </button>
                ` : ''}
                
                ${showLogout ? `
                <button class="header-btn logout-btn" onclick="logout()" title="Logout">
                    <i class="fas fa-sign-out-alt"></i>
                </button>
                ` : ''}
                
                ${customButtons.map((btn, idx) => `
                <button 
                    class="header-btn custom-btn" 
                    id="custom-btn-${idx}"
                    title="${btn.title}"
                    onclick="${btn.onclick}"
                >
                    <i class="${btn.icon}"></i>
                </button>
                `).join('')}
            </div>
        </div>
    `;

    header.innerHTML = headerHTML;
    return header;
}

function initializeUnifiedHeader(options = {}) {
    const header = createUnifiedHeader(options);
    
    // Insert at the very top of body (before everything)
    const appDiv = document.querySelector('#app');
    if (appDiv && appDiv.parentNode) {
        // Insert before #app
        appDiv.parentNode.insertBefore(header, appDiv);
        console.log('[UNIFIED-HEADER] Inserted before #app');
    } else {
        // Fallback: insert at top of body
        document.body.insertBefore(header, document.body.firstChild);
        console.log('[UNIFIED-HEADER] Inserted at top of body (fallback)');
    }

    // Remove blur when page finishes loading
    const removeBlur = () => {
        const headerEl = document.getElementById('unified-header');
        if (headerEl) {
            headerEl.style.filter = 'blur(0px)';
            headerEl.classList.remove('loading');
            headerEl.classList.add('loaded');
        }
    };

    if (document.readyState === 'complete') {
        removeBlur();
    } else {
        window.addEventListener('load', removeBlur);
    }

    // Initialize dynamic features
    updateDateTime();
    setInterval(updateDateTime, 1000);
    
    // Dark mode toggle
    const darkToggle = document.getElementById('header-dark-toggle');
    if (darkToggle) {
        darkToggle.addEventListener('click', toggleDarkMode);
        updateDarkModeIcon();
    }

    // Search functionality
    const searchInput = document.getElementById('header-search');
    if (searchInput) {
        // Keyboard shortcut Cmd+K or Ctrl+K
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                searchInput.focus();
            }
        });

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch(searchInput.value);
            }
        });
    }

    // Load user greeting
    loadUserGreeting();
}

function updateDateTime() {
    const now = new Date();
    
    // Format date
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('id-ID', options);
    const dateEl = document.getElementById('header-date');
    if (dateEl) dateEl.textContent = dateStr;
    
    // Format time
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;
    const timeEl = document.getElementById('header-time');
    if (timeEl) timeEl.textContent = timeStr;
    
    // Update greeting
    updateGreeting(now.getHours());
}

function updateGreeting(hours) {
    const timeEl = document.querySelector('.greeting-time');
    const prefixEl = document.querySelector('.greeting-prefix');
    
    if (!timeEl || !prefixEl) return;
    
    let greeting = 'Pagi';
    if (hours >= 12 && hours < 15) {
        greeting = 'Siang';
    } else if (hours >= 15 && hours < 19) {
        greeting = 'Sore';
    } else if (hours >= 19 || hours < 5) {
        greeting = 'Malam';
    }
    
    timeEl.textContent = greeting;
    prefixEl.textContent = 'Selamat';
}

function loadUserGreeting() {
    try {
        // Get user name from token or localStorage
        const userEl = document.querySelector('.user-name[data-user-name]');
        if (!userEl) return;
        
        // Try to get from localStorage first
        const userName = localStorage.getItem('user_name') || 
                        sessionStorage.getItem('user_name') || 
                        'User';
        
        userEl.textContent = userName;
    } catch (err) {
        console.warn('Could not load user greeting:', err);
    }
}

function updateDarkModeIcon() {
    const btn = document.getElementById('header-dark-toggle');
    if (!btn) return;
    
    const isDark = localStorage.getItem('dark_mode_enabled') === 'true';
    const icon = btn.querySelector('i');
    icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
}

function toggleDarkMode() {
    const isDark = localStorage.getItem('dark_mode_enabled') === 'true';
    localStorage.setItem('dark_mode_enabled', isDark ? 'false' : 'true');
    
    // Trigger dark mode change
    if (typeof applyDarkModeInlineStyles === 'function') {
        applyDarkModeInlineStyles();
    }
    
    updateDarkModeIcon();
}

function performSearch(query) {
    if (!query.trim()) return;
    
    // Dispatch custom search event
    window.dispatchEvent(new CustomEvent('headerSearch', { detail: { query } }));
    
    console.log('Search for:', query);
    // Can be overridden per-page
}

function goToMaintenance() {
    // Check user role from multiple sources
    let userRole = null;
    let debugInfo = {};
    
    // Try 1: Get from global currentUser (primary - used by auth.js)
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.role) {
        userRole = currentUser.role;
        debugInfo.currentUserRole = currentUser.role;
        debugInfo.method = 'currentUser global';
    }
    
    // Try 2: Get from user object in localStorage
    if (!userRole) {
        try {
            const userObj = localStorage.getItem('user');
            if (userObj) {
                const user = JSON.parse(userObj);
                userRole = user.role;
                debugInfo.localStorageUserRole = user.role;
                debugInfo.method = 'localStorage user object';
            }
        } catch (err) {
            console.error('Error parsing user object:', err);
            debugInfo.userObjError = err.message;
        }
    }
    
    // Try 3: Get from individual role keys
    if (!userRole) {
        const userRole1 = localStorage.getItem('userRole');
        const userRole2 = localStorage.getItem('user_role');
        userRole = userRole1 || userRole2;
        if (userRole) {
            debugInfo.method = 'localStorage userRole keys';
            debugInfo.foundKey = userRole1 ? 'userRole' : 'user_role';
        }
    }
    
    // Try 4: Get from session storage
    if (!userRole) {
        const sessionRole = sessionStorage.getItem('userRole');
        userRole = sessionRole;
        if (userRole) {
            debugInfo.method = 'sessionStorage';
        }
    }
    
    // Try 5: Decode from JWT token
    if (!userRole) {
        try {
            const token = localStorage.getItem('token');
            if (token) {
                const parts = token.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(atob(parts[1]));
                    userRole = payload.role;
                    debugInfo.tokenRole = payload.role;
                    debugInfo.method = 'JWT token';
                }
            }
        } catch (err) {
            console.error('Error decoding token:', err);
            debugInfo.tokenError = err.message;
        }
    }
    
    console.log('[Maintenance] Debug Info:', debugInfo);
    console.log('[Maintenance] Current user role:', userRole);
    console.log('[Maintenance] currentUser global:', typeof currentUser !== 'undefined' ? currentUser : 'undefined');
    
    // Allow admin, super_admin, and moderator
    const allowedRoles = ['admin', 'super_admin', 'moderator'];
    if (!userRole || !allowedRoles.includes(userRole)) {
        // Show styled alert with debug info
        showMaintenanceAccessDenied(userRole, debugInfo);
        return;
    }
    
    // Navigate to maintenance dashboard
    window.location.href = '/manage/maintenance.html';
}

function showMaintenanceAccessDenied(userRole, debugInfo) {
    // Create a styled notification using SweetAlert2 if available, else fallback
    const message = `Role "${userRole || 'Unknown'}" tidak memiliki akses ke Mode Perbaikan. Hanya admin dan moderator yang dapat mengakses.`;
    
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'warning',
            title: 'Akses Ditolak',
            text: message,
            footer: `Method: ${debugInfo.method || 'unknown'}`,
            confirmButtonText: 'OK',
            confirmButtonColor: '#667eea'
        });
    } else {
        // Fallback to console log + toast if available
        console.warn('[Maintenance] Access denied for role:', userRole);
        console.warn('[Maintenance] Debug info:', debugInfo);
        if (typeof showToast === 'function') {
            showToast(message, 'error');
        } else {
            alert(message);
        }
    }
}

// Auto-initialize if DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Only init if not already present
        if (!document.getElementById('unified-header')) {
            initializeUnifiedHeader();
        }
        
        // Listen for dark mode changes to update header immediately
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'data-dark-mode') {
                    const header = document.getElementById('unified-header');
                    if (header) {
                        header.style.transition = 'background-color 0.15s ease, border-color 0.15s ease';
                    }
                }
            });
        });
        
        observer.observe(document.documentElement, { attributes: true });
    });
} else {
    if (!document.getElementById('unified-header')) {
        initializeUnifiedHeader();
    }
    
    // Listen for dark mode changes
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'data-dark-mode') {
                const header = document.getElementById('unified-header');
                if (header) {
                    header.style.transition = 'background-color 0.15s ease, border-color 0.15s ease';
                }
            }
        });
    });
    
    observer.observe(document.documentElement, { attributes: true });
}
