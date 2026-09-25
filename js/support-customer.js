// ============================================
// Support Ticketing - Customer Dashboard
// ============================================

let currentPage = 1;
let currentLimit = 5;
let currentStatus = 'all';
let currentSearch = '';
let totalPages = 1;

// Cache keys
const CACHE_TICKETS = 'support_customer_tickets';
const CACHE_STATS = 'support_customer_stats';
const CACHE_TIMESTAMP = 'support_customer_cache_timestamp';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Support-Customer] Page loaded');
    
    // Initialize auth
    console.log('[Support-Customer] Initializing auth...');
    await initAuth();
    
    // Check if currentUser is loaded
    if (!currentUser) {
        console.error('[Support-Customer] currentUser still not defined after initAuth');
        document.body.innerHTML = '<div style="padding: 20px; color: red;">Error: Failed to authenticate</div>';
        return;
    }

    console.log('[Support-Customer] User authenticated:', currentUser.email, 'Role:', currentUser.role);
    
    // Check if user is admin_zona (customer)
    if (currentUser.role !== 'admin_zona' && currentUser.role !== 'super_admin') {
        console.log('[Support-Customer] User is not admin_zona, redirecting to moderator dashboard');
        window.location.href = '/support-dashboard';
        return;
    }
    
    // Display cached data immediately if available
    const cachedTickets = getCache(CACHE_TICKETS);
    const cachedStats = getCache(CACHE_STATS);
    
    if (cachedTickets && cachedStats) {
        console.log('[Support-Customer] Displaying cached data...');
        renderTickets(cachedTickets);
        updateCachedStats(cachedStats);
        updatePagination();
    }
    
    // Fetch fresh data in background
    console.log('[Support-Customer] Fetching fresh data in background...');
    const startTime = performance.now();
    Promise.all([
        loadStats(),
        loadTickets()
    ]).then(() => {
        const loadTime = (performance.now() - startTime).toFixed(0);
        console.log(`[Support-Customer] Fresh data loaded in ${loadTime}ms`);
    }).catch(err => {
        console.error('[Support-Customer] Error loading fresh data:', err);
    });

    console.log('[Support-Customer] Setting up event listeners...');
    
    // Setup event listeners
    const searchInput = document.getElementById('searchInput');
    const filterStatus = document.getElementById('filterStatus');
    
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

    console.log('[Support-Customer] Dashboard initialized with cached data');
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
    document.getElementById('statClosed').textContent = stats.closed || 0;
    console.log('[Support-Customer] Stats updated from cache');
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

async function loadStats() {
    try {
        console.log('[Support-Customer] Fetching stats...');
        const token = localStorage.getItem('jwt_token');
        
        if (!token) {
            console.warn('[Support-Customer] No JWT token');
            return;
        }

        const response = await fetch('http://localhost:5000/api/support/tickets/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log('[Support-Customer] Stats response status:', response.status);

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            console.error('[Support-Customer] Stats error:', error);
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log('[Support-Customer] Stats data:', data);
        
        const stats = data.stats || {};

        // Cache stats
        setCache(CACHE_STATS, stats);
        
        // Update UI
        updateCachedStats(stats);

        console.log('[Support-Customer] Stats updated and cached');
    } catch (error) {
        console.error('[Support-Customer] Error loading stats:', error);
        // Don't break on stats error
    }
}

async function loadTickets() {
    try {
        console.log('[Support-Customer] Loading tickets with params:', {
            page: currentPage,
            limit: currentLimit,
            status: currentStatus,
            search: currentSearch
        });

        const token = localStorage.getItem('jwt_token');
        
        if (!token) {
            console.error('[Support-Customer] No JWT token');
            throw new Error('No JWT token found');
        }

        const params = new URLSearchParams({
            page: currentPage,
            limit: currentLimit,
            ...(currentStatus !== 'all' && { status: currentStatus }),
            ...(currentSearch && { search: currentSearch })
        });

        const url = `/api/support/tickets?${params}`;
        console.log('[Support-Customer] Requesting:', url);

        // Add timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        console.log('[Support-Customer] Response status:', response.status);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('[Support-Customer] Error response:', errorData);
            throw new Error(`HTTP ${response.status}: ${errorData.error || 'Unknown'}`);
        }

        const data = await response.json();
        console.log('[Support-Customer] Response data:', data);

        const tickets = data.tickets || [];
        const pagination = data.pagination || {};

        totalPages = pagination.pages || 1;
        
        // Cache tickets only if no filters applied (cache the main list)
        if (!currentSearch && currentStatus === 'all') {
            setCache(CACHE_TICKETS, tickets);
            console.log('[Support-Customer] Tickets cached');
        }
        
        console.log('[Support-Customer] Rendering', tickets.length, 'tickets');
        renderTickets(tickets);
        updatePagination();

    } catch (error) {
        console.error('[Support-Customer] Error loading tickets:', error);
        const container = document.getElementById('ticketsContainer');
        if (!container) {
            console.error('[Support-Customer] Container not found!');
            return;
        }
        
        container.style.minHeight = '200px';
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.innerHTML = `
            <div style="text-align: center; color: #ef4444;">
                <div style="margin-bottom: 12px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 24px;"></i>
                </div>
                <div style="font-weight: 500;">${error.message}</div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 8px;">Check browser console for more details</div>
            </div>
        `;
    }
}

function renderTickets(tickets) {
    console.log('[Support-Customer] renderTickets called with', tickets.length, 'tickets');
    const container = document.getElementById('ticketsContainer');

    if (!container) {
        console.error('[Support-Customer] ticketsContainer not found');
        return;
    }

    if (tickets.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #6b7280;">
                <div style="font-size: 56px; margin-bottom: 16px; opacity: 0.4;">
                    <i class="fas fa-inbox"></i>
                </div>
                <div style="font-size: 18px; font-weight: 600; color: #1f2937; margin-bottom: 8px;">Tidak Ada Tiket</div>
                <div style="font-size: 13px; color: #9ca3af;">Belum ada tiket support yang dibuat</div>
            </div>
        `;
        console.log('[Support-Customer] Empty state rendered');
        return;
    }

    const html = `
        <table class="ticket-table">
            <thead>
                <tr>
                    <th style="width: 15%;">TIKET</th>
                    <th style="width: 30%;">SUBJEK</th>
                    <th style="width: 15%;">DEPARTMENT</th>
                    <th style="width: 12%;">STATUS</th>
                    <th style="width: 18%;">BALASAN TERAKHIR</th>
                    <th style="width: 10%;">AKSI</th>
                </tr>
            </thead>
            <tbody>
                ${tickets.map(ticket => {
                    const statusClass = (ticket.status || 'Open').toLowerCase().replace(/\s+/g, '-');
                    const statusValue = ticket.status || 'Open';
                    return `
                        <tr onclick="openTicket('${ticket.id}')">
                            <td>
                                <div class="ticket-number-col">${ticket.ticket_number || 'N/A'}</div>
                                <span class="ticket-date-col">${formatTicketDate(ticket.created_at)}</span>
                            </td>
                            <td class="ticket-subject-col">${ticket.subject || 'N/A'}</td>
                            <td class="ticket-category-col">${ticket.category || 'General'}</td>
                            <td>
                                <span class="status-dot ${statusClass}"></span>
                                <span class="status-text status-${statusClass}">● ${statusValue}</span>
                            </td>
                            <td class="last-update-col">${formatDate(ticket.updated_at)}</td>
                            <td class="action-col" onclick="event.stopPropagation();">
                                <button onclick="openTicket('${ticket.id}')" title="Lihat Detail">
                                    <i class="fas fa-chevron-right"></i>
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
    console.log('[Support-Customer] Table rendered with', tickets.length, 'rows');
}

function getPriorityColor(priority) {
    const colors = {
        'Low': '#3b82f6',
        'Medium': '#f59e0b',
        'High': '#ef4444',
        'Urgent': '#7c3aed'
    };
    return colors[priority] || '#f59e0b';
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
    console.log('[Support-Customer] Opening ticket:', ticketId);
    window.location.href = `/support-ticket-detail.html?id=${ticketId}`;
}

function showCreateModal() {
    // Navigate to create ticket page instead of showing modal
    window.location.href = '/support-create-ticket.html';
}

async function submitCreateTicket(e) {
    e.preventDefault();

    try {
        const token = localStorage.getItem('jwt_token');
        const subject = document.getElementById('formSubject').value;
        const description = document.getElementById('formDescription').value;
        const category = document.getElementById('formCategory').value;
        const priority = document.getElementById('formPriority').value;

        console.log('[Support-Customer] Creating ticket:', { subject, category, priority });

        const response = await fetch('http://localhost:5000/api/support/tickets', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                subject,
                description,
                category,
                priority
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create ticket');
        }

        const data = await response.json();
        const ticketId = data.ticket.id;

        console.log('[Support-Customer] Ticket created:', data.ticket.ticket_number);

        // Show success message
        alert(`✓ ${data.ticket.ticket_number} berhasil dibuat!`);

        closeCreateModal();

        // Reload and navigate to new ticket
        setTimeout(() => {
            loadStats();
            loadTickets();
        }, 500);

    } catch (error) {
        console.error('[Support-Customer] Error creating ticket:', error);
        alert(`Error: ${error.message}`);
    }
}

function formatTicketDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffHours < 1) {
        return 'Baru saja';
    } else if (diffHours < 24) {
        return `${Math.floor(diffHours)}h lalu`;
    } else if (diffDays < 7) {
        return `${Math.floor(diffDays)}d lalu`;
    } else {
        return date.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' });
    }
}
