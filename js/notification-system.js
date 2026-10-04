/**
 * notification-system.js
 * Global notification system untuk replace alert() dan confirm()
 * Usage: Notify.success(), Notify.error(), Notify.confirm()
 */

class NotificationSystem {
    constructor() {
        this.container = null;
        this.toastQueue = [];
        this.maxToasts = 5;
        this.initializeContainer();
    }

    /**
     * Initialize notification container
     */
    initializeContainer() {
        if (document.getElementById('notification-container')) return;

        const container = document.createElement('div');
        container.id = 'notification-container';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column-reverse;
            gap: 10px;
            max-width: 400px;
            pointer-events: none;
        `;
        document.body.appendChild(container);

        this.container = container;

        // Add CSS styles
        this.injectStyles();
    }

    /**
     * Inject CSS styles into head
     */
    injectStyles() {
        if (document.getElementById('notification-styles')) return;

        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            .notification {
                pointer-events: all;
                padding: 16px 20px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 500;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                animation: slideInRight 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                display: flex;
                align-items: center;
                gap: 12px;
                max-width: 400px;
                word-wrap: break-word;
                line-height: 1.4;
            }

            .notification.success {
                background: #d4edda;
                color: #155724;
                border: 1px solid #c3e6cb;
            }

            .notification.error {
                background: #f8d7da;
                color: #721c24;
                border: 1px solid #f5c6cb;
            }

            .notification.warning {
                background: #fff3cd;
                color: #856404;
                border: 1px solid #ffeaa7;
            }

            .notification.info {
                background: #d1ecf1;
                color: #0c5460;
                border: 1px solid #bee5eb;
            }

            .notification-icon {
                font-size: 18px;
                flex-shrink: 0;
            }

            .notification-close {
                margin-left: auto;
                cursor: pointer;
                font-size: 20px;
                color: inherit;
                opacity: 0.7;
                transition: opacity 0.2s;
                background: none;
                border: none;
                padding: 0;
                margin: 0;
            }

            .notification-close:hover {
                opacity: 1;
            }

            @keyframes slideInRight {
                from {
                    transform: translateY(400px);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }

            @keyframes slideOutRight {
                from {
                    transform: translateY(0);
                    opacity: 1;
                }
                to {
                    transform: translateY(400px);
                    opacity: 0;
                }
            }

            .notification.removing {
                animation: slideOutRight 0.4s cubic-bezier(0.34, 0, 0.66, -0.56) forwards;
            }

            /* Modal Styles */
            .notification-modal-overlay {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 10000;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }

            .notification-modal-overlay.active {
                display: flex;
            }

            .notification-modal {
                background: white;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                padding: 30px;
                max-width: 400px;
                width: 100%;
                animation: modalSlideIn 0.3s ease-out;
            }

            @keyframes modalSlideIn {
                from {
                    transform: scale(0.9);
                    opacity: 0;
                }
                to {
                    transform: scale(1);
                    opacity: 1;
                }
            }

            .notification-modal-header {
                margin-bottom: 16px;
            }

            .notification-modal-title {
                font-size: 18px;
                font-weight: 700;
                color: #333;
                margin: 0;
            }

            .notification-modal-message {
                font-size: 14px;
                color: #666;
                margin: 12px 0 0 0;
                line-height: 1.5;
            }

            .notification-modal-actions {
                display: flex;
                gap: 12px;
                margin-top: 24px;
            }

            .notification-modal-btn {
                flex: 1;
                padding: 10px 16px;
                border: none;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .notification-modal-btn-primary {
                background: #667eea;
                color: white;
            }

            .notification-modal-btn-primary:hover {
                background: #5568d3;
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
            }

            .notification-modal-btn-secondary {
                background: #f0f0f0;
                color: #666;
            }

            .notification-modal-btn-secondary:hover {
                background: #e0e0e0;
            }

            .notification-modal-btn-danger {
                background: #ff4757;
                color: white;
            }

            .notification-modal-btn-danger:hover {
                background: #ff3838;
            }

            /* Mobile responsive */
            @media (max-width: 640px) {
                #notification-container {
                    bottom: 16px;
                    right: 16px;
                    left: 16px;
                    max-width: none;
                }

                .notification {
                    max-width: none;
                    font-size: 13px;
                }

                .notification-modal {
                    padding: 20px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Show success notification
     */
    success(message, duration = 4000) {
        return this.show(message, 'success', '✓', duration);
    }

    /**
     * Show error notification
     */
    error(message, duration = 5000) {
        return this.show(message, 'error', '✕', duration);
    }

    /**
     * Show warning notification
     */
    warning(message, duration = 4000) {
        return this.show(message, 'warning', '⚠', duration);
    }

    /**
     * Show info notification
     */
    info(message, duration = 4000) {
        return this.show(message, 'info', 'ℹ', duration);
    }

    /**
     * Show notification
     */
    show(message, type = 'info', icon = 'ℹ', duration = 4000) {
        // Limit queue
        if (this.toastQueue.length >= this.maxToasts) {
            const first = this.toastQueue.shift();
            first.element.remove();
        }

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;

        notification.innerHTML = `
            <span class="notification-icon">${icon}</span>
            <span>${this.escapeHtml(message)}</span>
            <button class="notification-close">×</button>
        `;

        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            this.removeNotification(notification);
        });

        this.container.appendChild(notification);

        const notificationObj = {
            element: notification,
            type,
            timeout: duration > 0 ? setTimeout(() => {
                this.removeNotification(notification);
            }, duration) : null
        };

        this.toastQueue.push(notificationObj);

        return notificationObj;
    }

    /**
     * Remove notification
     */
    removeNotification(element) {
        element.classList.add('removing');
        setTimeout(() => {
            if (element.parentElement) {
                element.remove();
            }
            this.toastQueue = this.toastQueue.filter(n => n.element !== element);
        }, 300);
    }

    /**
     * Show confirm dialog
     */
    confirm(title, message, onConfirm, onCancel) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'notification-modal-overlay active';

            const modal = document.createElement('div');
            modal.className = 'notification-modal';

            modal.innerHTML = `
                <div class="notification-modal-header">
                    <h2 class="notification-modal-title">${this.escapeHtml(title)}</h2>
                    <p class="notification-modal-message">${this.escapeHtml(message)}</p>
                </div>
                <div class="notification-modal-actions">
                    <button class="notification-modal-btn notification-modal-btn-secondary" data-action="cancel">Batal</button>
                    <button class="notification-modal-btn notification-modal-btn-primary" data-action="confirm">Konfirmasi</button>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            const confirmBtn = modal.querySelector('[data-action="confirm"]');
            const cancelBtn = modal.querySelector('[data-action="cancel"]');

            const cleanup = () => {
                overlay.remove();
            };

            confirmBtn.addEventListener('click', () => {
                cleanup();
                if (onConfirm) onConfirm();
                resolve(true);
            });

            cancelBtn.addEventListener('click', () => {
                cleanup();
                if (onCancel) onCancel();
                resolve(false);
            });

            // Close on backdrop click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    cleanup();
                    if (onCancel) onCancel();
                    resolve(false);
                }
            });

            // Close on Escape key
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', handleEscape);
                    cleanup();
                    if (onCancel) onCancel();
                    resolve(false);
                }
            };
            document.addEventListener('keydown', handleEscape);
        });
    }

    /**
     * Show deletion confirm (red button)
     */
    confirmDelete(title, message, onConfirm, onCancel) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'notification-modal-overlay active';

            const modal = document.createElement('div');
            modal.className = 'notification-modal';

            modal.innerHTML = `
                <div class="notification-modal-header">
                    <h2 class="notification-modal-title">${this.escapeHtml(title)}</h2>
                    <p class="notification-modal-message">${this.escapeHtml(message)}</p>
                </div>
                <div class="notification-modal-actions">
                    <button class="notification-modal-btn notification-modal-btn-secondary" data-action="cancel">Batal</button>
                    <button class="notification-modal-btn notification-modal-btn-danger" data-action="confirm">Hapus</button>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            const confirmBtn = modal.querySelector('[data-action="confirm"]');
            const cancelBtn = modal.querySelector('[data-action="cancel"]');

            const cleanup = () => {
                overlay.remove();
            };

            confirmBtn.addEventListener('click', () => {
                cleanup();
                if (onConfirm) onConfirm();
                resolve(true);
            });

            cancelBtn.addEventListener('click', () => {
                cleanup();
                if (onCancel) onCancel();
                resolve(false);
            });

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    cleanup();
                    if (onCancel) onCancel();
                    resolve(false);
                }
            });

            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', handleEscape);
                    cleanup();
                    if (onCancel) onCancel();
                    resolve(false);
                }
            };
            document.addEventListener('keydown', handleEscape);
        });
    }

    /**
     * Escape HTML special characters
     */
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    /**
     * Clear all notifications
     */
    clearAll() {
        this.toastQueue.forEach(n => {
            if (n.timeout) clearTimeout(n.timeout);
            if (n.element.parentElement) {
                n.element.remove();
            }
        });
        this.toastQueue = [];
    }
}

// Global instance
const Notify = new NotificationSystem();

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Notify;
}
