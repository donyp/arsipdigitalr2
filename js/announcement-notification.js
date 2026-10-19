// Announcement Notification System for Admin Zona

class AnnouncementNotification {
    constructor() {
        this.unreadCount = 0;
        this.announcements = [];
        this.pollInterval = null;
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        // Create button and popup elements
        this.createNotificationButton();
        this.createNotificationPopup();

        // Load initial announcements
        await this.loadUnreadCount();

        // Poll for new announcements every 30 seconds
        this.pollInterval = setInterval(() => this.loadUnreadCount(), 30000);

        this.isInitialized = true;
    }

    createNotificationButton() {
        const existingBtn = document.getElementById('announcementNotificationBtn');
        if (existingBtn) return;

        // Create button style if not exists
        const style = document.createElement('style');
        style.textContent = `
            .announcement-btn {
                position: relative;
                background: none;
                border: none;
                padding: 8px 12px;
                cursor: pointer;
                font-size: 18px;
                color: #667eea;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .announcement-btn:hover {
                opacity: 0.7;
            }

            .announcement-badge {
                position: absolute;
                top: -4px;
                right: -4px;
                background: #ef4444;
                color: white;
                border-radius: 50%;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 11px;
                font-weight: 700;
            }

            .announcement-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                animation: fadeIn 0.2s ease;
            }

            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            .announcement-modal.hidden {
                display: none;
            }

            .announcement-modal-content {
                background: var(--color-bg-secondary, #ffffff);
                border-radius: 12px;
                max-width: 600px;
                width: 90%;
                max-height: 80vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
                animation: slideUp 0.3s ease;
            }

            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .announcement-modal-header {
                padding: 20px;
                border-bottom: 1px solid var(--color-border, #e5e7eb);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .announcement-modal-title {
                font-size: 18px;
                font-weight: 700;
                color: var(--color-text-primary, #1f2937);
            }

            .announcement-modal-close {
                background: none;
                border: none;
                font-size: 20px;
                cursor: pointer;
                color: var(--color-text-secondary, #6b7280);
                transition: all 0.2s;
            }

            .announcement-modal-close:hover {
                color: var(--color-text-primary, #1f2937);
            }

            .announcement-modal-list {
                overflow-y: auto;
                flex: 1;
                padding: 12px 0;
            }

            .announcement-item {
                padding: 16px 20px;
                border-bottom: 1px solid var(--color-border, #e5e7eb);
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                gap: 12px;
                align-items: flex-start;
                position: relative;
            }

            .announcement-item:hover {
                background: var(--color-bg-tertiary, #f3f4f6);
            }

            .announcement-item.unread::before {
                content: '';
                position: absolute;
                left: 0;
                top: 50%;
                transform: translateY(-50%);
                width: 4px;
                height: 100%;
                background: #667eea;
            }

            .announcement-unread-dot {
                width: 8px;
                height: 8px;
                background: #667eea;
                border-radius: 50%;
                flex-shrink: 0;
                margin-top: 4px;
            }

            .announcement-item-content {
                flex: 1;
                min-width: 0;
            }

            .announcement-item-title {
                font-weight: 600;
                font-size: 13px;
                color: var(--color-text-primary, #1f2937);
                margin-bottom: 4px;
            }

            .announcement-item-type {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                font-size: 11px;
                font-weight: 600;
                padding: 2px 8px;
                border-radius: 4px;
                margin-bottom: 6px;
            }

            .announcement-item-type svg {
                width: 14px;
                height: 14px;
                flex-shrink: 0;
                display: inline-block;
            }

            .announcement-item-type.Informasi {
                background: #dbeafe;
                color: #1e40af;
            }

            .announcement-item-type.Peringatan {
                background: #fef3c7;
                color: #92400e;
            }

            .announcement-item-type.Penting {
                background: #fee2e2;
                color: #991b1b;
            }

            .announcement-item-type.Maintenance {
                background: #dcfce7;
                color: #15803d;
            }

            html[data-dark-mode="true"] .announcement-item-type.Informasi {
                background: #1e3a8a;
                color: #93c5fd;
            }

            html[data-dark-mode="true"] .announcement-item-type.Peringatan {
                background: #78350f;
                color: #fcd34d;
            }

            html[data-dark-mode="true"] .announcement-item-type.Penting {
                background: #7f1d1d;
                color: #fca5a5;
            }

            html[data-dark-mode="true"] .announcement-item-type.Maintenance {
                background: #15803d;
                color: #86efac;
            }

            .announcement-item-date {
                font-size: 11px;
                color: var(--color-text-tertiary, #9ca3af);
            }

            /* Detail Modal */
            .announcement-detail-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(4px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                animation: fadeIn 0.2s ease;
            }

            .announcement-detail-modal.hidden {
                display: none;
            }

            .announcement-detail-content {
                background: var(--color-bg-secondary, #ffffff);
                border-radius: 12px;
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
                animation: slideUp 0.3s ease;
            }

            .announcement-detail-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                padding: 24px;
                border-bottom: 1px solid var(--color-border, #e5e7eb);
                gap: 16px;
            }

            .announcement-detail-title-section {
                flex: 1;
            }

            .announcement-detail-title {
                font-size: 20px;
                font-weight: 800;
                color: var(--color-text-primary, #1f2937);
                margin: 0 0 8px 0;
            }

            .announcement-detail-meta {
                display: flex;
                gap: 12px;
                flex-wrap: wrap;
                align-items: center;
                margin-top: 8px;
            }

            .announcement-detail-close {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: var(--color-text-secondary, #6b7280);
                transition: all 0.2s;
                flex-shrink: 0;
            }

            .announcement-detail-close:hover {
                color: var(--color-text-primary, #1f2937);
            }

            .announcement-detail-body {
                padding: 24px;
                color: var(--color-text-primary, #1f2937);
                line-height: 1.6;
            }

            .announcement-detail-body h1,
            .announcement-detail-body h2,
            .announcement-detail-body h3,
            .announcement-detail-body h4,
            .announcement-detail-body h5,
            .announcement-detail-body h6 {
                margin: 16px 0 8px 0;
                font-weight: 700;
            }

            .announcement-detail-body p {
                margin: 8px 0;
            }

            .announcement-detail-body ul,
            .announcement-detail-body ol {
                margin: 12px 0;
                padding-left: 24px;
            }

            .announcement-detail-body li {
                margin: 4px 0;
            }

            .announcement-detail-date {
                font-size: 12px;
                color: var(--color-text-tertiary, #9ca3af);
                margin-top: 12px;
                padding-top: 12px;
                border-top: 1px solid var(--color-border, #e5e7eb);
            }
        `;
        document.head.appendChild(style);

        // Create button container
        const headerNav = document.querySelector('header nav') || document.querySelector('.navbar-nav') || document.querySelector('nav');
        if (!headerNav) return;

        const button = document.createElement('button');
        button.id = 'announcementNotificationBtn';
        button.className = 'announcement-btn';
        button.title = 'Pengumuman';
        button.innerHTML = `
            <i class="fas fa-bell"></i>
        `;
        button.onclick = () => this.toggleNotificationPopup();

        // Insert before logout button or at the end
        const logoutBtn = headerNav.querySelector('[onclick*="logout"]') || headerNav.querySelector('.logout');
        if (logoutBtn) {
            logoutBtn.parentElement.insertBefore(button, logoutBtn);
        } else {
            headerNav.appendChild(button);
        }
    }

    createNotificationPopup() {
        if (document.getElementById('announcementPopup')) return;

        const popup = document.createElement('div');
        popup.id = 'announcementPopup';
        popup.className = 'announcement-modal hidden';
        popup.innerHTML = `
            <div class="announcement-modal-content">
                <div class="announcement-modal-header">
                    <div class="announcement-modal-title">
                        <i class="fas fa-bell" style="color: #ff9800; margin-right: 8px;"></i>Pengumuman
                    </div>
                    <button class="announcement-modal-close" onclick="announcementNotification.toggleNotificationPopup()">&times;</button>
                </div>
                <div class="announcement-modal-list" id="announcementList">
                    <div style="text-align: center; padding: 20px; color: var(--color-text-tertiary, #9ca3af);">Memuat...</div>
                </div>
            </div>
        `;
        document.body.appendChild(popup);

        // Create detail modal
        const detailModal = document.createElement('div');
        detailModal.id = 'announcementDetailModal';
        detailModal.className = 'announcement-detail-modal hidden';
        detailModal.onclick = (e) => {
            if (e.target === detailModal) this.closeDetailModal();
        };
        detailModal.innerHTML = `
            <div class="announcement-detail-content">
                <div class="announcement-detail-header">
                    <div class="announcement-detail-title-section">
                        <h1 class="announcement-detail-title" id="detailTitle">-</h1>
                        <div class="announcement-detail-meta">
                            <span class="announcement-item-type" id="detailType">-</span>
                            <span class="announcement-item-date" id="detailDate">-</span>
                        </div>
                    </div>
                    <button class="announcement-detail-close" onclick="announcementNotification.closeDetailModal()">&times;</button>
                </div>
                <div class="announcement-detail-body" id="detailContent">
                    Memuat...
                </div>
            </div>
        `;
        document.body.appendChild(detailModal);
    }

    toggleNotificationPopup() {
        const popup = document.getElementById('announcementPopup');
        if (popup.classList.contains('hidden')) {
            popup.classList.remove('hidden');
            this.loadAnnouncements();
        } else {
            popup.classList.add('hidden');
        }
    }

    async loadUnreadCount() {
        const token = localStorage.getItem('jwt_token');
        try {
            const response = await fetch('/api/announcements/unread/count', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to load unread count');
            const data = await response.json();

            // Update badge in main dashboard
            const badge = document.getElementById('announcementBadge');
            this.unreadCount = data.unread_count;

            if (this.unreadCount > 0) {
                badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        } catch (error) {
            console.error('Error loading unread count:', error);
        }
    }

    getTypeIcon(type) {
        const icons = {
            'Informasi': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 2px;"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 6v4M12 14v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
            'Peringatan': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 2px;"><path d="M13 13H11V7H13M13 17H11V15H13M1 21H23L12 2L1 21Z" fill="currentColor"/></svg>',
            'Penting': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor"/></svg>',
            'Maintenance': '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 2px;"><path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.37-.29-.59-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.37-2.65c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.37 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.48-.02-.59.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.37.29.59.22l2.49-1c.52.4 1.08.73 1.69.98l.37 2.65c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.37-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.48.02.59-.22l2 3.46c.12.22.07.49-.12.64l-2.11 1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" fill="currentColor"/></svg>'
        };
        return icons[type] || icons['Informasi'];
    }

    async loadAnnouncements() {
        const token = localStorage.getItem('jwt_token');
        const list = document.getElementById('announcementList');

        try {
            const response = await fetch('/api/announcements', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to load announcements');
            const data = await response.json();
            this.announcements = data.announcements;

            if (this.announcements.length === 0) {
                list.innerHTML = `
                    <div style="text-align: center; padding: 40px 20px; color: var(--color-text-tertiary, #9ca3af);">
                        <i class="fas fa-inbox" style="font-size: 32px; opacity: 0.3; margin-bottom: 12px;"></i>
                        <div>Tidak ada pengumuman</div>
                    </div>
                `;
                return;
            }

            list.innerHTML = this.announcements.map((ann, index) => {
                const isRead = ann.current_user_read;
                const date = new Date(ann.created_at).toLocaleDateString('id-ID');
                const typeIcon = this.getTypeIcon(ann.announcement_type);
                return `
                    <div class="announcement-item ${!isRead ? 'unread' : ''}" onclick="announcementNotification.showDetail(${index})">
                        ${!isRead ? '<div class="announcement-unread-dot"></div>' : ''}
                        <div class="announcement-item-content">
                            <div class="announcement-item-title">${ann.title}</div>
                            <span class="announcement-item-type ${ann.announcement_type}">${typeIcon}${ann.announcement_type}</span>
                            <div class="announcement-item-date">Di release Pada: ${date}</div>
                        </div>
                    </div>
                `;
            }).join('');

            // Refresh badge count after loading announcements
            await this.loadUnreadCount();
        } catch (error) {
            console.error('Error loading announcements:', error);
            list.innerHTML = '<div style="color: red; padding: 20px;">Error memuat pengumuman</div>';
        }
    }

    showDetail(index) {
        const ann = this.announcements[index];
        if (!ann) return;

        document.getElementById('detailTitle').textContent = ann.title;
        
        const typeIcon = this.getTypeIcon(ann.announcement_type);
        const detailType = document.getElementById('detailType');
        detailType.innerHTML = `${typeIcon}${ann.announcement_type}`;
        detailType.className = `announcement-item-type ${ann.announcement_type}`;
        
        // Format date with time in WIB timezone
        const createdDate = new Date(ann.created_at);
        const formattedDate = createdDate.toLocaleDateString('id-ID') + ' ' + 
                             String(createdDate.getHours()).padStart(2, '0') + ':' +
                             String(createdDate.getMinutes()).padStart(2, '0') + ' WIB';
        document.getElementById('detailDate').textContent = `Di release Pada: ${formattedDate}`;
        
        document.getElementById('detailContent').innerHTML = `${ann.content}`;

        document.getElementById('announcementDetailModal').classList.remove('hidden');
        
        // Mark as read by calling the API (this will reload the list)
        this.markAsRead(ann.id);
    }

    async markAsRead(announcementId) {
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await fetch(`/api/announcements/${announcementId}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                console.log('Announcement marked as read:', announcementId);
                // Reload announcements to update read status
                await this.loadAnnouncements();
                await this.loadUnreadCount();
                // Update dashboard badge with aggressive retry
                if (typeof window.triggerBadgeUpdate === 'function') {
                    window.triggerBadgeUpdate();
                } else if (typeof window.updateAnnouncementBadge === 'function') {
                    window.updateAnnouncementBadge();
                }
            }
        } catch (err) {
            console.warn('Could not mark announcement as read:', err.message);
        }
    }

    closeDetailModal() {
        document.getElementById('announcementDetailModal').classList.add('hidden');
    }

    destroy() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
    }
}

// Initialize notification system
const announcementNotification = new AnnouncementNotification();

// Global function to open notifications (called from header button)
function openAnnouncementNotifications() {
    announcementNotification.toggleNotificationPopup();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        announcementNotification.initialize();
    });
} else {
    announcementNotification.initialize();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    announcementNotification.destroy();
});
