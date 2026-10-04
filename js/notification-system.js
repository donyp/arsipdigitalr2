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
        // If body not ready, defer initialization
        if (!document.body) {
            console.warn('[Notify] document.body not ready, deferring container initialization');
            setTimeout(() => this.initializeContainer(), 100);
            return;
        }

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
        
        try {
            document.body.appendChild(container);
            this.container = container;
            console.log('[Notify] Container initialized');
        } catch (error) {
            console.error('[Notify] Failed to append container:', error);
            // Try again in next tick
            setTimeout(() => this.initializeContainer(), 100);
            return;
        }

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
                border-radius: 12px;
                font-size: 14px;
                font-weight: 500;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
                animation: slideInRight 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                display: flex;
                align-items: center;
                gap: 14px;
                max-width: 400px;
                word-wrap: break-word;
                line-height: 1.5;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.2);
                transition: all 0.3s ease;
            }

            .notification:hover {
                transform: translateX(-4px);
                box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.1);
            }

            .notification.success {
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: #ffffff;
                border: 1px solid rgba(255, 255, 255, 0.3);
            }

            .notification.error {
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                color: #ffffff;
                border: 1px solid rgba(255, 255, 255, 0.3);
            }

            .notification.warning {
                background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                color: #ffffff;
                border: 1px solid rgba(255, 255, 255, 0.3);
            }

            .notification.info {
                background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                color: #ffffff;
                border: 1px solid rgba(255, 255, 255, 0.3);
            }

            .notification-icon {
                font-size: 20px;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 24px;
                background: rgba(255, 255, 255, 0.25);
                border-radius: 6px;
            }

            .notification-close {
                margin-left: auto;
                cursor: pointer;
                font-size: 22px;
                color: inherit;
                opacity: 0.7;
                transition: all 0.2s;
                background: none;
                border: none;
                padding: 0;
                margin: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 28px;
                height: 28px;
                border-radius: 6px;
            }

            .notification-close:hover {
                opacity: 1;
                background: rgba(255, 255, 255, 0.2);
            }

            @keyframes slideInRight {
                from {
                    transform: translateX(420px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }

            @keyframes slideOutRight {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(420px);
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
                background: #ffffff;
                border-radius: 16px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25), 0 0 1px rgba(0, 0, 0, 0.1);
                padding: 32px;
                max-width: 420px;
                width: 100%;
                animation: modalSlideIn 0.3s ease-out;
                border: 1px solid rgba(255, 255, 255, 0.8);
            }

            @keyframes modalSlideIn {
                from {
                    transform: scale(0.92) translateY(20px);
                    opacity: 0;
                }
                to {
                    transform: scale(1) translateY(0);
                    opacity: 1;
                }
            }

            .notification-modal-header {
                margin-bottom: 20px;
            }

            .notification-modal-title {
                font-size: 20px;
                font-weight: 700;
                color: #1f2937;
                margin: 0;
                letter-spacing: -0.5px;
            }

            .notification-modal-message {
                font-size: 14px;
                color: #6b7280;
                margin: 12px 0 0 0;
                line-height: 1.6;
            }

            .notification-modal-actions {
                display: flex;
                gap: 10px;
                margin-top: 28px;
            }

            .notification-modal-btn {
                flex: 1;
                padding: 12px 20px;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
                text-transform: uppercase;
                letter-spacing: 0.6px;
            }

            .notification-modal-btn-primary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }

            .notification-modal-btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(102, 126, 234, 0.35);
            }

            .notification-modal-btn-primary:active {
                transform: translateY(0);
            }

            .notification-modal-btn-secondary {
                background: #f3f4f6;
                color: #6b7280;
                border: 1.5px solid #e5e7eb;
            }

            .notification-modal-btn-secondary:hover {
                background: #f9fafb;
                border-color: #d1d5db;
                transform: translateY(-2px);
            }

            .notification-modal-btn-secondary:active {
                transform: translateY(0);
            }

            .notification-modal-btn-danger {
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                color: white;
            }

            .notification-modal-btn-danger:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(239, 68, 68, 0.35);
            }

            .notification-modal-btn-danger:active {
                transform: translateY(0);
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
                    padding: 14px 18px;
                }

                .notification-modal {
                    padding: 24px;
                }

                .notification-modal-title {
                    font-size: 18px;
                }

                .notification-modal-btn {
                    padding: 10px 16px;
                    font-size: 13px;
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

// Global instance - initialize only when DOM is ready
let Notify = null;

function initializeNotifySystem() {
    if (Notify === null) {
        Notify = new NotificationSystem();
        console.log('[Notify] System initialized');
    }
    return Notify;
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeNotifySystem();
    });
} else {
    // DOM already loaded
    initializeNotifySystem();
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Notify: () => initializeNotifySystem(), initializeNotifySystem };
}


/**
 * GLOBAL OVERRIDE: Intercept all alert() and confirm() calls
 * Automatically replace with Notify system
 * This ensures any new code using alert/confirm gets replaced automatically
 */

// Override window.alert() - replace with Notify.info()
const originalAlert = window.alert;
window.alert = function(message) {
    const notify = initializeNotifySystem();
    // Detect if it's a success message (has ✓ or success keywords)
    if (message && (message.includes('✓') || message.includes('berhasil') || message.includes('sukses'))) {
        notify.success(message);
    }
    // Detect if it's an error message (has ✕ or error keywords)
    else if (message && (message.includes('✕') || message.includes('error') || message.includes('gagal'))) {
        notify.error(message);
    }
    // Default to info
    else {
        notify.info(message || 'Information');
    }
};

// Override window.confirm() - replace with Notify.confirm()
const originalConfirm = window.confirm;
window.confirm = function(message) {
    return new Promise((resolve) => {
        const notify = initializeNotifySystem();
        // Detect if it's a delete/destructive action
        if (message && (message.toLowerCase().includes('hapus') || message.toLowerCase().includes('delete'))) {
            notify.confirmDelete(
                'Confirm Action',
                message,
                () => resolve(true),
                () => resolve(false)
            );
        }
        // Generic confirmation
        else {
            Notify.confirm(
                'Confirm',
                message,
                () => resolve(true),
                () => resolve(false)
            );
        }
    });
};

// Fallback if Notify not yet initialized
if (typeof window.Notify === 'undefined') {
    window.Notify = new NotificationSystem();
}
