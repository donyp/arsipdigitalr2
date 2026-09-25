// ============================================
// Support Ticketing - Moderator Dashboard
// ============================================

let currentTab = 'active';
let currentPage = 1;
let currentLimit = 20;
let currentStatus = 'all';
let currentZona = '';
let currentSearch = '';
let totalPages = 1;
let zonasMap = {}; // Cache for zona lookup

// Cache keys
const CACHE_TICKETS = 'support_moderator_tickets';
const CACHE_STATS = 'support_moderator_stats';
const CACHE_ZONAS = 'support_zonas';
const CACHE_TIMESTAMP = 'support_cache_timestamp';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Support-Moderator] Page loaded');
    
    // Initialize auth
    console.log('[Support-Moderator] Initializing auth...');
    await initAuth();
    
    // Check if currentUser is loaded
    if (!currentUser) {
        console.error('[Support-Moderator] currentUser still not defined after initAuth');
        document.body.innerHTML = '<div style="padding: 20px; color: red;">Error: Failed to authenticate</div>';
        return;
    }

    console.log('[Support-Moderator] User authenticated:', currentUser.email, 'Role:', currentUser.role);
    
    // Load zonas in background (non-blocking)
    console.log('[Support-Moderator] Loading zonas in background...');
    loadZonas().catch(err => console.error('[Support-Moderator] Error loading zonas:', err));
    
    // Display cached data immediately
    const cachedTickets = getCache(CACHE_TICKETS);
    const cachedStats = getCache(CACHE_STATS);
    
    if (cachedTickets && cachedStats) {
        console.log('[Support-Moderator] Displaying cached data immediately...');
        renderTickets(cachedTickets);
        updateCachedStats(cachedStats);
        updatePagination();
        console.log('[Support-Moderator] Cache displayed');
    }
    
    // Fetch fresh data in background
    console.log('[Support-Moderator] Fetching fresh data in background...');
    const startTime = performance.now();
    Promise.all([
        loadStats(),
        loadTickets()
    ]).then(() => {
        const loadTime = (performance.now() - startTime).toFixed(0);
        console.log(`[Support-Moderator] Fresh data loaded in ${loadTime}ms`);
    }).catch(err => {
        console.error('[Support-Moderator] Error loading fresh data:', err);
    });

    console.log('[Support-Moderator] Setting up event listeners...');
    
    // Setup event listeners
    const searchInput = document.getElementById('searchInput');
    const filterStatus = document.getElementById('filterStatus');
    const filterZona = document.getElementById('filterZona');
    
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            currentSearch = searchInput.value;
            currentPage = 1;
            loadTickets();
        }, 300));
    }

    if (filterStatus) {
        filterStatus.addEventListener('change', () => {
            currentStatus = filterStatus.value;
            currentPage = 1;
            loadTickets();
        });
    }

    if (filterZona) {
        filterZona.addEventListener('change', () => {
            currentZona = filterZona.value;
            currentPage = 1;
            loadTickets();
        });
    }

    console.log('[Support-Moderator] Dashboard initialized - showing cached data if available');
});

// Cache management functions
function setCache(key, value, duration = CACHE_DURATION) {
    try {
        const data = {
            value: value,
            timestamp: Date.now(),
            duration: duration
        };
        localStorage.setItem(key, JSON.stringify(data));
        console.log(`[Cache] Set ${key}`);
    } catch (err) {
        console.warn('[Cache] Failed to set cache:', err);
    }
}

function getCache(key) {
    try {
        const item = localStorage.getItem(key);
        if (!item) return null;
        
        const data = JSON.parse(item);
        const isExpired = (Date.now() - data.timestamp) > data.duration;
        
        if (isExpired) {
            console.log(`[Cache] ${key} expired, removing`);
            localStorage.removeItem(key);
            return null;
        }
        
        console.log(`[Cache] Retrieved ${key}`);
        return data.value;
    } catch (err) {
        console.warn('[Cache] Failed to get cache:', err);
        return null;
    }
}

function clearCache(key) {
    try {
        localStorage.removeItem(key);
        console.log(`[Cache] Cleared ${key}`);
    } catch (err) {
        console.warn('[Cache] Failed to clear cache:', err);
    }
}

function updateCachedStats(stats) {
    document.getElementById('statTotal').textContent = stats.total || 0;
    document.getElementById('statOpen').textContent = stats.open || 0;
    document.getElementById('statAnswered').textContent = stats.answered || 0;
    document.getElementById('statResolved').textContent = stats.resolved || 0;
    document.getElementById('statClosed').textContent = stats.closed || 0;
    console.log('[Support-Moderator] Stats updated from cache');
}

async function loadZonas() {
    try {
        const token = localStorage.getItem('jwt_token');
        const response = await fetch(`${CONFIG.API_URL}/api/zonas`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const zonas = data.zonas || data.data || [];
            
            console.log('[Support-Moderator] Zonas response:', zonas);
            
            // Create map: zona_id (id) -> zona_name (nama)
            zonas.forEach(zona => {
                zonasMap[zona.id] = zona.nama;
            });
            
            console.log('[Support-Moderator] Zonas loaded:', zonasMap);
            
            // Populate filter dropdown AFTER we have the map
            await populateZonaFilter(zonas);
        }
    } catch (error) {
        console.error('[Support-Moderator] Error loading zonas:', error);
    }
}

async function populateZonaFilter(zonas) {
    const filterZona = document.getElementById('filterZona');
    if (!filterZona) return;
    
    // Load all tickets to get unique zonas
    try {
        const token = localStorage.getItem('jwt_token');
        const response = await fetch(`${CONFIG.API_URL}/api/support/tickets?limit=1000`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const tickets = data.tickets || [];
            
            // Get unique zona_ids from tickets
            const uniqueZonaIds = [...new Set(tickets.map(t => t.zona_id))].sort((a, b) => a - b);
            
            console.log('[Support-Moderator] Unique zona IDs in tickets:', uniqueZonaIds);
            
            // Clear existing options except first
            while (filterZona.options.length > 1) {
                filterZona.remove(1);
            }
            
            // Add options for zonas that have tickets
            uniqueZonaIds.forEach(zonaId => {
                const zonaName = zonasMap[zonaId] || `Zona ${zonaId}`;
                const option = document.createElement('option');
                option.value = zonaId;
                option.textContent = zonaName;
                filterZona.appendChild(option);
            });
            
            console.log('[Support-Moderator] Zona filter populated');
        }
    } catch (error) {
        console.error('[Support-Moderator] Error populating zona filter:', error);
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function switchTab(event, tab) {
    console.log('[Support-Moderator] Switching to tab:', tab);
    currentTab = tab;
    currentPage = 1;
    
    // Update tab UI
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.closest('.tab-btn')?.classList.add('active');
    
    // Set status filter based on tab
    if (tab === 'active') {
        // Show only active statuses: Open, Answered
        currentStatus = 'all';
        // We'll filter on frontend for active tickets
        loadTickets();
    } else if (tab === 'history') {
        // Show only closed statuses: Resolved, Closed
        currentStatus = 'all';
        // We'll filter on frontend for history tickets
        loadTickets();
    }
}

async function loadStats() {
    try {
        console.log('[Support-Moderator] Fetching stats...');
        const token = localStorage.getItem('jwt_token');
        
        if (!token) {
            console.warn('[Support-Moderator] No JWT token');
            return;
        }

        const response = await fetch('http://localhost:5000/api/support/tickets/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log('[Support-Moderator] Stats response status:', response.status);

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            console.error('[Support-Moderator] Stats error:', error);
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log('[Support-Moderator] Stats data:', data);
        
        const stats = data.stats || {};

        // Cache stats
        setCache(CACHE_STATS, stats);
        
        // Update UI
        updateCachedStats(stats);

        console.log('[Support-Moderator] Stats updated and cached');
    } catch (error) {
        console.error('[Support-Moderator] Error loading stats:', error);
        // Don't break on stats error, continue to load tickets
    }
}

async function loadTickets() {
    try {
        console.log('[Support-Moderator] Loading tickets with params:', {
            page: currentPage,
            limit: currentLimit,
            status: currentStatus,
            zona: currentZona,
            search: currentSearch
        });

        const token = localStorage.getItem('jwt_token');
        
        if (!token) {
            console.error('[Support-Moderator] No JWT token');
            throw new Error('No JWT token found');
        }

        const params = new URLSearchParams({
            page: currentPage,
            limit: currentLimit,
            ...(currentStatus !== 'all' && { status: currentStatus }),
            ...(currentZona && { zona_id: currentZona }),
            ...(currentSearch && { search: currentSearch })
        });

        const url = `/api/support/tickets?${params}`;
        console.log('[Support-Moderator] Requesting:', url);

        // Add timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        console.log('[Support-Moderator] Response status:', response.status);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('[Support-Moderator] Error response:', errorData);
            throw new Error(`HTTP ${response.status}: ${errorData.error || 'Unknown'}`);
        }

        const data = await response.json();
        console.log('[Support-Moderator] Response data:', data);

        const tickets = data.tickets || [];
        const pagination = data.pagination || {};

        totalPages = pagination.pages || 1;
        
        // Cache tickets only if no filters applied (cache the main list)
        if (!currentSearch && !currentZona && currentStatus === 'all') {
            setCache(CACHE_TICKETS, tickets);
            console.log('[Support-Moderator] Tickets cached');
        }
        
        console.log('[Support-Moderator] Rendering', tickets.length, 'tickets');
        renderTickets(tickets);
        updatePagination();

    } catch (error) {
        console.error('[Support-Moderator] Error loading tickets:', error);
        const container = document.getElementById('ticketsContainer');
        if (!container) {
            console.error('[Support-Moderator] Container not found!');
            return;
        }
        
        container.style.minHeight = '200px';
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: #ef4444; padding: 48px 16px;">
                    <div style="margin-bottom: 12px;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 24px;"></i>
                    </div>
                    <div style="font-weight: 500;">${error.message}</div>
                    <div style="font-size: 12px; color: #6b7280; margin-top: 8px;">Check browser console for more details</div>
                </td>
            </tr>
        `;
    }
}

function renderTickets(tickets) {
    console.log('[Support-Moderator] renderTickets called with', tickets.length, 'tickets');
    const container = document.getElementById('ticketsContainer');

    if (!container) {
        console.error('[Support-Moderator] ticketsContainer not found');
        return;
    }

    // Check dark mode
    const isDarkMode = localStorage.getItem('dark_mode_enabled') === 'true';
    const textColor = isDarkMode ? '#f1f5f9' : '#1f2937';
    const secondaryTextColor = isDarkMode ? '#cbd5e1' : '#6b7280';
    const bgHover = isDarkMode ? '#334155' : '#f9fafb';
    const bgDefault = isDarkMode ? 'transparent' : 'white';
    const borderColor = isDarkMode ? '#475569' : '#e5e7eb';

    // Filter tickets based on current tab
    let filteredTickets = tickets;
    if (currentTab === 'active') {
        // Show only active statuses
        filteredTickets = tickets.filter(t => 
            ['Open', 'Answered'].includes(t.status)
        );
    } else if (currentTab === 'history') {
        // Show only history statuses
        filteredTickets = tickets.filter(t => 
            ['Resolved', 'Closed'].includes(t.status)
        );
    }

    if (filteredTickets.length === 0) {
        container.innerHTML = `
            <tr>
                <td colspan="7" style="padding: 48px 16px; text-align: center; background: ${bgDefault}; border-bottom: 1px solid ${borderColor};">
                    <div class="empty-state" style="padding: 0; color: ${secondaryTextColor};">
                        <div class="empty-state-icon">📭</div>
                        <div>Tidak ada tiket ditemukan</div>
                    </div>
                </td>
            </tr>
        `;
        console.log('[Support-Moderator] Empty state rendered');
        return;
    }

    const html = filteredTickets.map(ticket => {
        const priorityClass = (ticket.priority || 'medium').toLowerCase();
        const statusClass = (ticket.status || 'open').toLowerCase().replace(/\s+/g, '-');
        
        // Get zona name - extract number from zona_name if available, else use zona_id
        let zonaDisplay = 'N/A';
        if (ticket.zona_name) {
            const match = ticket.zona_name.match(/(\d+)/);
            if (match) {
                zonaDisplay = 'Zona ' + (match[1].replace(/^0+/, '') || '0');
            } else {
                zonaDisplay = ticket.zona_name;
            }
        } else if (zonasMap[ticket.zona_id]) {
            const zonaName = zonasMap[ticket.zona_id];
            const match = zonaName.match(/(\d+)/);
            if (match) {
                zonaDisplay = 'Zona ' + (match[1].replace(/^0+/, '') || '0');
            } else {
                zonaDisplay = zonaName;
            }
        }
        
        // Get relative time from created_at
        const relativeTime = getRelativeTime(ticket.created_at);
        
        return `
            <tr style="border-bottom: 1px solid ${borderColor}; cursor: pointer; transition: background 0.2s; background: ${bgDefault};" onclick="openTicket('${ticket.id}')" onmouseover="this.style.background='${bgHover}'" onmouseout="this.style.background='${bgDefault}'">
                <td style="padding: 12px 16px; font-weight: 500; color: ${textColor};">${ticket.ticket_number || 'N/A'}</td>
                <td style="padding: 12px 16px; color: ${textColor}; max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${ticket.subject}">${ticket.subject || 'N/A'}</td>
                <td style="padding: 12px 16px; color: ${secondaryTextColor}; font-size: 14px;">${zonaDisplay}</td>
                <td style="padding: 12px 16px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="width: 4px; height: 20px; border-radius: 2px; background: ${getPriorityColor(priorityClass)}; display: inline-block;"></span>
                        <span style="font-size: 13px; color: ${secondaryTextColor};">${ticket.priority || 'Medium'}</span>
                    </div>
                </td>
                <td style="padding: 12px 16px;">
                    <span style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; text-transform: uppercase; background: ${getStatusBgDarkMode(statusClass, isDarkMode)}; color: ${getStatusColorDarkMode(statusClass, isDarkMode)};">
                        ${ticket.status || 'Open'}
                    </span>
                </td>
                <td style="padding: 12px 16px; font-size: 13px; color: ${secondaryTextColor};">${relativeTime}</td>
                <td style="padding: 12px 16px; text-align: center;">
                    <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); openTicket('${ticket.id}')">
                        <i class="fas fa-arrow-right"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    container.innerHTML = html;
    console.log('[Support-Moderator] Table rendered with', filteredTickets.length, 'rows');
}

// Dark mode helper functions for status styling
function getStatusBgDarkMode(status, isDarkMode) {
    if (!isDarkMode) {
        const map = {
            'open': '#fee2e2',
            'answered': '#dbeafe',
            'in-progress': '#fef3c7',
            'resolved': '#dcfce7',
            'closed': '#f3f4f6'
        };
        return map[status] || '#dbeafe';
    } else {
        const map = {
            'open': '#7f1d1d',
            'answered': '#0c2d6b',
            'in-progress': '#78350f',
            'resolved': '#14532d',
            'closed': '#374151'
        };
        return map[status] || '#0c2d6b';
    }
}

function getStatusColorDarkMode(status, isDarkMode) {
    if (!isDarkMode) {
        const map = {
            'open': '#991b1b',
            'answered': '#1e40af',
            'in-progress': '#92400e',
            'resolved': '#166534',
            'closed': '#374151'
        };
        return map[status] || '#1e40af';
    } else {
        const map = {
            'open': '#fecaca',
            'answered': '#93c5fd',
            'in-progress': '#fcd34d',
            'resolved': '#86efac',
            'closed': '#d1d5db'
        };
        return map[status] || '#93c5fd';
    }
}

function getPriorityColor(priority) {
    const colors = {
        'low': '#3b82f6',
        'medium': '#f59e0b',
        'high': '#ef4444',
        'urgent': '#7c3aed'
    };
    return colors[priority] || colors['medium'];
}

function getStatusBg(status) {
    const colors = {
        'open': '#fee2e2',
        'in-progress': '#fef3c7',
        'answered': '#dbeafe',
        'resolved': '#dcfce7',
        'closed': '#f3f4f6'
    };
    return colors[status] || colors['open'];
}

function getStatusColor(status) {
    const colors = {
        'open': '#991b1b',
        'in-progress': '#92400e',
        'answered': '#1e40af',
        'resolved': '#166534',
        'closed': '#374151'
    };
    return colors[status] || colors['open'];
}

function updatePagination() {
    const info = `Halaman ${currentPage} dari ${totalPages}`;
    document.getElementById('paginationInfo').textContent = info;

    const prevBtn = document.getElementById('btnPrevPage');
    const nextBtn = document.getElementById('btnNextPage');
    
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

function nextPage() {
    if (currentPage < totalPages) {
        currentPage++;
        loadTickets();
        window.scrollTo(0, 0);
    }
}

function previousPage() {
    if (currentPage > 1) {
        currentPage--;
        loadTickets();
        window.scrollTo(0, 0);
    }
}

function openTicket(ticketId) {
    console.log('[Support-Moderator] Opening ticket:', ticketId);
    window.location.href = `/support-ticket-detail-moderator.html?id=${ticketId}`;
}

function formatUserId(userId) {
    if (!userId) return '-';
    return userId.substring(0, 8);
}

function getRelativeTime(dateString) {
    if (!dateString) return '-';
    
    try {
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        
        if (seconds < 60) {
            return 'Baru Saja';
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            return `${minutes} Menit Yang Lalu`;
        } else if (seconds < 86400) {
            const hours = Math.floor(seconds / 3600);
            return `${hours} Jam Yang Lalu`;
        } else if (seconds < 604800) {
            const days = Math.floor(seconds / 86400);
            return `${days} Hari Yang Lalu`;
        } else if (seconds < 2592000) {
            const weeks = Math.floor(seconds / 604800);
            return `${weeks} Minggu Yang Lalu`;
        } else {
            const months = Math.floor(seconds / 2592000);
            return `${months} Bulan Yang Lalu`;
        }
    } catch (e) {
        console.error('[getRelativeTime] Error:', e);
        return '-';
    }
}

