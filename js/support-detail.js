// ============================================
// Support Ticketing System - Detail View
// ============================================

let ticketId = null;
let ticketData = null;

document.addEventListener('DOMContentLoaded', async () => {
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

    // Get ticket ID from URL
    const params = new URLSearchParams(window.location.search);
    ticketId = params.get('id');

    if (!ticketId) {
        document.body.innerHTML = '<div style="padding: 20px; text-align: center; color: red;">Ticket ID not provided</div>';
        return;
    }

    // Load ticket details
    await loadTicketDetail();

    // Setup reply form
    const replyForm = document.getElementById('replyForm');
    if (replyForm) {
        replyForm.addEventListener('submit', submitReply);
    }

    // Show/hide internal note checkbox for moderators
    if (currentUser.role === 'moderator' || currentUser.role === 'super_admin') {
        document.getElementById('internalNoteGroup').style.display = 'flex';
    }
});

async function loadTicketDetail() {
    try {
        const token = localStorage.getItem('jwt_token');
        const response = await fetch(`/api/support/tickets/${ticketId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Ticket not found');
            }
            throw new Error('Failed to load ticket');
        }

        const data = await response.json();
        ticketData = data.ticket;

        renderTicketDetail();
        renderMessages(ticketData.messages);
        updateActionButtons();
    } catch (error) {
        document.getElementById('ticketTitle').textContent = 'Error Loading Ticket';
        document.getElementById('ticketStatus').textContent = error.message;
    }
}

function renderTicketDetail() {
    const ticket = ticketData;

    document.getElementById('ticketNumber').textContent = ticket.ticket_number;
    document.getElementById('ticketTitle').textContent = ticket.subject;
    document.getElementById('ticketSubject').textContent = ticket.subject;
    document.getElementById('ticketDescription').textContent = ticket.description;
    document.getElementById('categoryValue').textContent = ticket.category;
    document.getElementById('createdDate').textContent = formatDateTime(ticket.created_at);

    // Status badge
    const statusBadge = document.getElementById('statusBadge');
    statusBadge.textContent = ticket.status;
    statusBadge.className = `status-badge status-${ticket.status.toLowerCase().replace(/\s+/g, '-')}`;
    document.getElementById('ticketStatus').textContent = ticket.status;

    // Priority badge
    const priorityBadge = document.getElementById('priorityBadge');
    priorityBadge.textContent = ticket.priority;
    priorityBadge.className = `priority-badge priority-${ticket.priority.toLowerCase()}`;

    // Render ticket attachments
    if (ticket.attachments && ticket.attachments.length > 0) {
        const container = document.getElementById('ticketAttachments');
        container.innerHTML = ticket.attachments.map(att => renderAttachment(att)).join('');
        document.getElementById('ticketAttachmentsContainer').style.display = 'block';
    }
}

function renderMessages(messages) {
    const container = document.getElementById('messagesContainer');

    if (!messages || messages.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: #6b7280; padding: 40px;">
                <div style="font-size: 32px; margin-bottom: 10px;">💬</div>
                <div>Belum ada balasan</div>
            </div>
        `;
        return;
    }

    container.innerHTML = messages.map(msg => `
        <div class="message-box ${msg.is_internal ? 'internal-note' : ''}">
            <div class="message-header">
                <div class="message-meta">
                    ${msg.user_id} • ${formatDateTime(msg.created_at)}
                    ${msg.is_internal ? '<span class="internal-badge">INTERNAL</span>' : ''}
                </div>
            </div>
            <div class="message-content">${msg.message}</div>
            ${msg.attachments && msg.attachments.length > 0 ? `
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                    <div style="font-weight: 600; font-size: 13px; color: #4b5563; margin-bottom: 8px;">Lampiran:</div>
                    ${msg.attachments.map(att => renderAttachment(att)).join('')}
                </div>
            ` : ''}
        </div>
    `).join('');
}

function renderAttachment(attachment) {
    const fileIcon = getFileIcon(attachment.file_type || attachment.file_name);
    const fileSize = formatFileSize(attachment.file_size);

    return `
        <div class="attachment-item">
            <div class="attachment-icon">${fileIcon}</div>
            <div>
                <div class="attachment-name">${attachment.file_name}</div>
                <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">${fileSize}</div>
            </div>
            <a href="/api/support/tickets/${ticketId}/download/${attachment.id}" class="attachment-download" target="_blank">
                <i class="fas fa-download"></i> Download
            </a>
        </div>
    `;
}

function getFileIcon(fileTypeOrName) {
    if (typeof fileTypeOrName === 'string') {
        if (fileTypeOrName.includes('pdf')) return '📄';
        if (fileTypeOrName.includes('image')) return '🖼️';
        if (fileTypeOrName.includes('word') || fileTypeOrName.endsWith('.doc') || fileTypeOrName.endsWith('.docx')) return '📝';
        if (fileTypeOrName.includes('sheet') || fileTypeOrName.endsWith('.xls') || fileTypeOrName.endsWith('.xlsx')) return '📊';
        if (fileTypeOrName.endsWith('.zip') || fileTypeOrName.endsWith('.rar')) return '📦';
    }
    return '📎';
}

function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function updateActionButtons() {
    const ticket = ticketData;
    const isModerator = currentUser.role === 'moderator' || currentUser.role === 'super_admin';

    // Show resolve/close buttons only for moderators
    if (isModerator && ticket.status !== 'Closed' && ticket.status !== 'Resolved') {
        if (ticket.status !== 'Resolved') {
            document.getElementById('btnResolve').style.display = 'inline-block';
        }
        if (ticket.status !== 'Closed') {
            document.getElementById('btnClose').style.display = 'inline-block';
        }
    }

    // Show/hide reply form based on status
    if (ticket.status === 'Closed') {
        document.getElementById('replyFormContainer').innerHTML = `
            <div style="text-align: center; color: #6b7280; padding: 20px; background: #f9fafb; border-radius: 6px;">
                <i class="fas fa-lock" style="font-size: 24px; margin-bottom: 10px; display: block;"></i>
                Tiket ini sudah ditutup dan tidak dapat diberikan balasan lagi.
            </div>
        `;
    }
}

async function submitReply(e) {
    e.preventDefault();

    try {
        const token = localStorage.getItem('jwt_token');
        const message = document.getElementById('replyMessage').value;
        const attachment = document.getElementById('replyAttachment').files[0];
        const isInternalNote = document.getElementById('isInternalNote')?.checked || false;

        if (!message.trim()) {
            showNotification('Pesan tidak boleh kosong', 'error');
            return;
        }

        const btnSend = document.getElementById('btnSendReply');
        btnSend.disabled = true;
        btnSend.innerHTML = '<div class="loading-spinner" style="display: inline-block; margin-right: 8px;"></div>Sending...';

        // First, post the message
        const msgResponse = await fetch(`/api/support/tickets/${ticketId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                is_internal: isInternalNote
            })
        });

        if (!msgResponse.ok) {
            throw new Error('Failed to post message');
        }

        const msgData = await msgResponse.json();
        const messageId = msgData.message.id;

        // If there's an attachment, upload it
        if (attachment) {
            const formData = new FormData();
            formData.append('attachment', attachment);
            formData.append('message_id', messageId);

            const uploadResponse = await fetch(`/api/support/tickets/${ticketId}/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (!uploadResponse.ok) {
            }
        }
        showNotification('✓ Balasan dikirim!', 'success');

        // Reset form and reload
        document.getElementById('replyForm').reset();
        setTimeout(() => {
            loadTicketDetail();
        }, 1000);

    } catch (error) {
        showNotification(`Error: ${error.message}`, 'error');
    } finally {
        const btnSend = document.getElementById('btnSendReply');
        btnSend.disabled = false;
        btnSend.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim Balasan';
    }
}

async function resolveTicket() {
    if (!confirm('Tandai tiket ini sebagai Resolved?')) return;

    try {
        const token = localStorage.getItem('jwt_token');
        const response = await fetch(`/api/support/tickets/${ticketId}/status`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'Resolved' })
        });

        if (!response.ok) throw new Error('Failed to resolve ticket');

        showNotification('✓ Tiket ditandai sebagai Resolved', 'success');
        setTimeout(() => loadTicketDetail(), 1000);
    } catch (error) {
        showNotification(`Error: ${error.message}`, 'error');
    }
}

async function closeTicket() {
    if (!confirm('Tutup tiket ini?')) return;

    try {
        const token = localStorage.getItem('jwt_token');
        const response = await fetch(`/api/support/tickets/${ticketId}/status`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'Closed' })
        });

        if (!response.ok) throw new Error('Failed to close ticket');

        showNotification('✓ Tiket ditutup', 'success');
        setTimeout(() => loadTicketDetail(), 1000);
    } catch (error) {
        showNotification(`Error: ${error.message}`, 'error');
    }
}

function goBackToList() {
    window.location.href = '/support-dashboard.html';
}

function formatDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
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
