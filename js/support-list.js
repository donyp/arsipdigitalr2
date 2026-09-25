// ============================================
// Support Ticketing System - List View
// ============================================

let currentPage = 1;
let currentLimit = 20;
let currentStatus = 'all';
let currentSearch = '';
let totalTickets = 0;
let totalPages = 1;

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Support-List] Initializing support dashboard...');
    
    // Wait for auth to load
    await new Promise(resolve => {
        if (typeof currentUser !== 'undefined' && currentUser) {
            resolve();
        } else {
            const checkInterval = setInterval(() => {
                if (typeof currentUser !== 'undefined' && currentUser) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        }
    });

    // Load initial data
    await loadStats();
    await loadTickets();

    // Setup event listeners
    document.getElementById('searchInput').addEventListener('input', debounce((e) => {
        currentSearch = e.target.value;
        currentPage = 1;
        loadTickets();
    }, 300));

    document.getElementById('filterStatus').addEventListener('change', (e) => {
        currentStatus = e.target.value;
        currentPage = 1;
        loadTickets();
    });

    document.getElementById('filterLimit').addEventListener('change', (e) => {
        currentLimit = parseInt(e.target.value);
        currentPage = 1;
        loadTickets();
    });

    // Check if user can create tickets (not moderator/super_admin)
    if (currentUser.role === 'moderator' || currentUser.role === 'super_admin') {
        document.getElementById('btnCreateTicket').style.display = 'none';
    }
});

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
        const response = await fetch(`${CONFIG.API_URL}/api/support/tickets/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load stats');

        const data = await response.json();
        const stats = data.stats;

        document.getElementById('statTotal').textContent = stats.total;
        document.getElementById('statOpen').textContent = stats.open;
        document.getElementById('statAnswered').textContent = stats.answered;
        document.getElementById('statClosed').textContent = stats.closed;

        console.log('[Support-List] Stats loaded:', stats);
    } catch (error) {
        console.error('[Support-List] Error loading stats:', error);
    }
}

async function loadTickets() {
    try {
        const token = localStorage.getItem('jwt_token');
        const params = new URLSearchParams({
            page: currentPage,
            limit: currentLimit,
            ...(currentStatus !== 'all' && { status: currentStatus }),
            ...(currentSearch && { search: currentSearch })
        });

        const response = await fetch(`/api/support/tickets?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load tickets');

        const data = await response.json();
        const { tickets, pagination } = data;

        totalTickets = pagination.total;
        totalPages = pagination.pages;

        renderTickets(tickets);
        updatePagination();

        console.log('[Support-List] Tickets loaded:', tickets.length);
    } catch (error) {
        console.error('[Support-List] Error loading tickets:', error);
        document.getElementById('ticketsContainer').innerHTML = `
            <div class="table-row cursor-default">
                <div class="col-span-6 text-center text-red-500">
                    Error loading tickets: ${error.message}
                </div>
            </div>
        `;
    }
}

function renderTickets(tickets) {
    const container = document.getElementById('ticketsContainer');

    if (tickets.length === 0) {
        container.innerHTML = `
            <div class="table-row cursor-default">
                <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: #6b7280;">
                    <div class="text-4xl mb-3">📭</div>
                    <div>Tidak ada tiket ditemukan</div>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = tickets.map(ticket => `
        <div class="table-row" onclick="goToTicket('${ticket.id}')">
            <div>
                <div class="font-bold text-gray-800">${ticket.ticket_number}</div>
            </div>
            <div class="truncate text-gray-800">${ticket.subject}</div>
            <div class="text-gray-700">${ticket.category || '-'}</div>
            <div>
                <span class="status-badge status-${ticket.status.toLowerCase().replace(/\s+/g, '-')}">
                    ${ticket.status}
                </span>
            </div>
            <div class="text-sm text-gray-600">${formatDate(ticket.updated_at)}</div>
            <div class="text-center">
                <button class="btn btn-secondary btn-small" onclick="event.stopPropagation(); goToTicket('${ticket.id}')">
                    <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function updatePagination() {
    const info = `Halaman ${currentPage} dari ${totalPages} (${totalTickets} total tiket)`;
    document.getElementById('paginationInfo').textContent = info;

    document.getElementById('btnPrevPage').disabled = currentPage <= 1;
    document.getElementById('btnNextPage').disabled = currentPage >= totalPages;
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

function showCreateModal() {
    document.getElementById('createModal').classList.add('active');
}

function closeCreateModal() {
    document.getElementById('createModal').classList.remove('active');
    document.getElementById('createForm').reset();
}

async function submitCreateTicket(e) {
    e.preventDefault();

    try {
        const token = localStorage.getItem('jwt_token');
        const subject = document.getElementById('formSubject').value;
        const description = document.getElementById('formDescription').value;
        const category = document.getElementById('formCategory').value;
        const priority = document.getElementById('formPriority').value;

        // Get user's zona
        const userZonaId = currentUser.zona_id || 'default';

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
                priority,
                zona_id: userZonaId
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create ticket');
        }

        const data = await response.json();
        const ticketId = data.ticket.id;

        console.log('[Support-List] Ticket created:', data.ticket.ticket_number);

        // Show success message
        showNotification(`✓ ${data.ticket.ticket_number} berhasil dibuat!`, 'success');

        closeCreateModal();

        // Reload and navigate to new ticket
        setTimeout(() => {
            goToTicket(ticketId);
        }, 500);

    } catch (error) {
        console.error('[Support-List] Error creating ticket:', error);
        showNotification(`Error: ${error.message}`, 'error');
    }
}

function goToTicket(ticketId) {
    window.location.href = `/support-ticket-detail.html?id=${ticketId}`;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffHours < 1) {
        return 'Just now';
    } else if (diffHours < 24) {
        return `${Math.floor(diffHours)}h ago`;
    } else if (diffDays < 7) {
        return `${Math.floor(diffDays)}d ago`;
    } else {
        return date.toLocaleDateString('id-ID', { month: 'short', day: 'numeric', year: 'numeric' });
    }
}

function showNotification(message, type = 'info') {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    const bgColor = type === 'success' ? '#10b981' : (type === 'error' ? '#ef4444' : '#3b82f6');
    const icon = type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ');

    toast.style.cssText = `
        background: ${bgColor};
        color: white;
        padding: 16px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 300px;
        font-weight: 500;
        font-size: 14px;
        animation: slideInRight 0.3s ease-out;
    `;

    toast.innerHTML = `
        <span style="font-size: 18px; font-weight: bold;">${icon}</span>
        <span>${message}</span>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
