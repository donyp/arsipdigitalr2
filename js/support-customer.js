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
    // Initialize auth
    await initAuth();
    
    // Check if currentUser is loaded
    if (!currentUser) {
        document.body.innerHTML = '<div style="padding: 20px; color: red;">Error: Failed to authenticate</div>';
        return;
    }
    // Check if user is admin_zona (customer)
    if (currentUser.role !== 'admin_zona' && currentUser.role !== 'super_admin') {
        window.location.href = '/support-dashboard';
        return;
    }
    
    // Display cached data immediately if available
    const cachedTickets = getCache(CACHE_TICKETS);
    const cachedStats = getCache(CACHE_STATS);
    
    if (cachedTickets && cachedStats) {
        renderTickets(cachedTickets);
        updateCachedStats(cachedStats);
        updatePagination();
    }
    
    // Fetch fresh data in background
    const startTime = performance.now();
    Promise.all([
        loadStats(),
        loadTickets()
    ]).then(() => {
        const loadTime = (performance.now() - startTime).toFixed(0);
    }).catch(err => {
    });
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
    } catch (err) {
    }
}

function getCache(key) {
    try {
        const item = localStorage.getItem(key);
        if (!item) return null;
        
        const data = JSON.parse(item);
        const isExpired = (Date.now() - data.timestamp) > data.duration;
        
        if (isExpired) {
            localStorage.removeItem(key);
            return null;
        }
        return data.value;
    } catch (err) {
        return null;
    }
}

function clearCache(key) {
    try {
        localStorage.removeItem(key);
    } catch (err) {
    }
}

function updateCachedStats(stats) {
    document.getElementById('statTotal').textContent = stats.total || 0;
    document.getElementById('statOpen').textContent = stats.open || 0;
    document.getElementById('statAnswered').textContent = stats.answered || 0;
    document.getElementById('statClosed').textContent = stats.closed || 0;
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
        const token = localStorage.getItem('jwt_token');
        
        if (!token) {
            return;
        }

        const response = await fetch(`${CONFIG.API_URL}/api/support/tickets/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const stats = data.stats || {};

        // Cache stats
        setCache(CACHE_STATS, stats);
        
        // Update UI
        updateCachedStats(stats);
    } catch (error) {
        // Don't break on stats error
    }
}

async function loadTickets() {
    try {
        const token = localStorage.getItem('jwt_token');
        
        if (!token) {
            throw new Error('No JWT token found');
        }

        const params = new URLSearchParams({
            page: currentPage,
            limit: currentLimit,
            ...(currentStatus !== 'all' && { status: currentStatus }),
            ...(currentSearch && { search: currentSearch })
        });

        const url = `/api/support/tickets?${params}`;
        // Add timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`HTTP ${response.status}: ${errorData.error || 'Unknown'}`);
        }

        const data = await response.json();
        const tickets = data.tickets || [];
        const pagination = data.pagination || {};

        totalPages = pagination.pages || 1;
        
        // Cache tickets only if no filters applied (cache the main list)
        if (!currentSearch && currentStatus === 'all') {
            setCache(CACHE_TICKETS, tickets);
        }
        renderTickets(tickets);
        updatePagination();

    } catch (error) {
        const container = document.getElementById('ticketsContainer');
        if (!container) {
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
    const container = document.getElementById('ticketsContainer');

    if (!container) {
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
        return;
    }

    // Separate tickets into active and closed
    const activeTickets = tickets.filter(t => t.status !== 'Closed');
    const closedTickets = tickets.filter(t => t.status === 'Closed');
    let html = '';

    // Active Tickets Section
    if (activeTickets.length > 0) {
        html += `
            <div style="margin-bottom: 32px;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
                    <div style="width: 4px; height: 28px; background: linear-gradient(180deg, #667eea 0%, #764ba2 100%); border-radius: 4px;"></div>
                    <h2 style="font-size: 20px; font-weight: 800; color: var(--color-text-primary); margin: 0;">Tiket Aktif</h2>
                    <span style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 700;">${activeTickets.length}</span>
                </div>
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
                        ${activeTickets.map(ticket => renderTicketRow(ticket)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // Closed Tickets Section
    if (closedTickets.length > 0) {
        html += `
            <div style="margin-top: 40px;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
                    <div style="width: 4px; height: 28px; background: linear-gradient(180deg, #94a3b8 0%, #64748b 100%); border-radius: 4px;"></div>
                    <h2 style="font-size: 20px; font-weight: 800; color: var(--color-text-secondary); margin: 0;">Tiket Closed</h2>
                    <span style="background: rgba(107, 114, 128, 0.2); color: var(--color-text-secondary); padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 700;">${closedTickets.length}</span>
                </div>
                <table class="ticket-table" style="opacity: 0.7;">
                    <thead>
                        <tr>
                            <th style="width: 15%;">TIKET</th>
                            <th style="width: 30%;">SUBJEK</th>
                            <th style="width: 15%;">DEPARTMENT</th>
                            <th style="width: 12%;">STATUS</th>
                            <th style="width: 18%;">DITUTUP PADA</th>
                            <th style="width: 10%;">AKSI</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${closedTickets.map(ticket => renderTicketRow(ticket)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

function renderTicketRow(ticket) {
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
    window.location.href = `/support-ticket-detail.html?id=${ticketId}`;
}

function showCreateModal() {
    // Navigate to create ticket page instead of showing modal
    window.location.href = '/zona/ticket';
}

async function submitCreateTicket(e) {
    e.preventDefault();

    try {
        const token = localStorage.getItem('jwt_token');
        const subject = document.getElementById('formSubject').value;
        const description = document.getElementById('formDescription').value;
        const category = document.getElementById('formCategory').value;
        const priority = document.getElementById('formPriority').value;
        const response = await fetch(`${CONFIG.API_URL}/api/support/tickets`, {
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
        // Show success message
        alert(`✓ ${data.ticket.ticket_number} berhasil dibuat!`);

        closeCreateModal();

        // Reload and navigate to new ticket
        setTimeout(() => {
            loadStats();
            loadTickets();
        }, 500);

    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

function formatTicketDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDate(dateString) {
    if (!dateString) return '-';
    
    // Ensure date is parsed as UTC if no timezone info
    let date;
    const hasTimezone = /[Z+\-]\d{2}:?\d{2}$/.test(dateString) || dateString.endsWith('Z');
    
    if (!hasTimezone) {
        const normalizedString = dateString.replace(' ', 'T');
        date = new Date(normalizedString + 'Z');
    } else {
        date = new Date(dateString);
    }
    
    const now = new Date();
    const diffMs = now - date;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffMinutes < 1) {
        return 'Baru saja';
    } else if (diffMinutes < 60) {
        return `${diffMinutes} menit yang lalu`;
    } else if (diffHours < 24) {
        return `${Math.floor(diffHours)}h lalu`;
    } else if (diffDays < 7) {
        return `${Math.floor(diffDays)}d lalu`;
    } else {
        return date.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' });
    }
}
