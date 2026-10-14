/**
 * Maintenance Mode Banner Component
 * Displays maintenance notification to all users
 * Handles real-time updates via WebSocket/polling
 */

class MaintenanceBanner {
    constructor(options = {}) {
        this.options = {
            pollInterval: 10000, // Check every 10 seconds
            showBanner: true,
            autoHideAfterEnd: true,
            ...options
        };
        
        this.bannerElement = null;
        this.pollTimer = null;
        this.maintenanceActive = false;
        this.maintenanceData = null;
    }

    /**
     * Initialize banner
     */
    async init() {
        console.log('[MaintenanceBanner] Initializing...');
        
        // Check initial status
        await this.checkMaintenanceStatus();
        
        // Start polling
        this.startPolling();
        
        // Listen for WebSocket updates if available
        this.setupWebSocketListener();
    }

    /**
     * Check current maintenance status
     */
    async checkMaintenanceStatus() {
        try {
            const response = await fetch('/api/maintenance/status', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();
            
            if (data.isActive) {
                this.showMaintenanceBanner(data);
            } else if (this.maintenanceActive) {
                this.hideMaintenanceBanner();
            }

            this.maintenanceActive = data.isActive;
            this.maintenanceData = data;

        } catch (err) {
            console.error('[MaintenanceBanner] Status check error:', err.message);
        }
    }

    /**
     * Show maintenance banner
     */
    showMaintenanceBanner(data) {
        if (this.bannerElement) {
            return; // Already shown
        }

        console.log('[MaintenanceBanner] Showing banner');

        // Calculate time remaining
        const estimatedEnd = new Date(data.estimatedEnd);
        const timeRemaining = this.formatTimeRemaining(estimatedEnd);

        // Create banner HTML with modern, fancy design
        const banner = document.createElement('div');
        banner.id = 'maintenance-banner';
        banner.className = 'maintenance-banner maintenance-banner-warning';
        banner.innerHTML = `
            <div class="maintenance-banner-container">
                <div class="maintenance-banner-heartbeat">
                    <div class="heartbeat-dot"></div>
                </div>
                <div class="maintenance-banner-content">
                    <div class="maintenance-banner-title">
                        Sistem sedang dalam proses maintenance
                    </div>
                </div>
                <div class="maintenance-banner-timer">
                    <div id="maintenance-countdown" class="maintenance-countdown">
                        ${timeRemaining}
                    </div>
                </div>
            </div>
        `;

        // Insert at top of body
        document.body.insertBefore(banner, document.body.firstChild);
        this.bannerElement = banner;

        // Start countdown timer
        this.startCountdownTimer(estimatedEnd);

        // Adjust body padding if needed
        this.adjustPagePadding();
    }

    /**
     * Hide maintenance banner
     */
    hideMaintenanceBanner() {
        if (!this.bannerElement) {
            return;
        }

        console.log('[MaintenanceBanner] Hiding banner with slide-up animation');
        
        // Add slide-up animation class
        this.bannerElement.classList.add('maintenance-banner-fade-out');
        
        setTimeout(() => {
            if (this.bannerElement && this.bannerElement.parentNode) {
                this.bannerElement.parentNode.removeChild(this.bannerElement);
            }
            this.bannerElement = null;
            this.restorePagePadding();
        }, 400);
    }

    /**
     * Hide banner manually (user clicked close)
     */
    hideBannerManual() {
        this.hideMaintenanceBanner();
        // Don't stop polling - maintenance status might change
    }

    /**
     * Start polling for maintenance status
     */
    startPolling() {
        this.pollTimer = setInterval(() => {
            this.checkMaintenanceStatus();
        }, this.options.pollInterval);

        console.log(`[MaintenanceBanner] Polling started (${this.options.pollInterval}ms)`);
    }

    /**
     * Stop polling
     */
    stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
            console.log('[MaintenanceBanner] Polling stopped');
        }
    }

    /**
     * Start countdown timer
     */
    startCountdownTimer(estimatedEnd) {
        // Update countdown every second
        const updateCountdown = () => {
            if (!this.bannerElement) {
                return;
            }

            const now = new Date();
            const remaining = estimatedEnd - now;

            if (remaining <= 0) {
                const countdownEl = document.getElementById('maintenance-countdown');
                if (countdownEl) {
                    countdownEl.textContent = 'Selesai';
                }
                
                // Auto-hide banner when maintenance time expires
                console.log('[MaintenanceBanner] Maintenance time expired, auto-hiding banner');
                setTimeout(() => {
                    this.hideMaintenanceBanner();
                }, 500);
                
                return;
            }

            const timeString = this.formatTimeRemaining(estimatedEnd);
            const countdownEl = document.getElementById('maintenance-countdown');
            if (countdownEl) {
                countdownEl.textContent = timeString;
            }
        };

        // Update immediately and then every second
        updateCountdown();
        const countdownInterval = setInterval(updateCountdown, 1000);

        // Store interval ID for cleanup
        if (this.bannerElement) {
            this.bannerElement._countdownInterval = countdownInterval;
        }
    }

    /**
     * Format time remaining
     */
    formatTimeRemaining(estimatedEnd) {
        const now = new Date();
        const remaining = estimatedEnd - now;

        if (remaining <= 0) {
            return 'Segera selesai';
        }

        const totalSeconds = Math.floor(remaining / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Adjust page padding for banner
     */
    adjustPagePadding() {
        if (this.bannerElement) {
            const bannerHeight = this.bannerElement.offsetHeight;
            document.body.style.paddingTop = bannerHeight + 'px';
        }
    }

    /**
     * Restore page padding
     */
    restorePagePadding() {
        document.body.style.paddingTop = '0px';
    }

    /**
     * Setup WebSocket listener for real-time updates
     */
    setupWebSocketListener() {
        try {
            const token = localStorage.getItem('jwt_token') || localStorage.getItem('token');
            if (!token) {
                console.log('[MaintenanceBanner] No token available, skipping WebSocket connection');
                return;
            }

            // Build WebSocket URL
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws/maintenance?token=${token}`;

            console.log('[MaintenanceBanner] Connecting to WebSocket...');

            const ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('[MaintenanceBanner] WebSocket connected');
                window.maintenanceWebSocket = ws;
                
                // Request current status
                ws.send(JSON.stringify({ type: 'request_status' }));
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);

                    if (message.type === 'maintenance_status') {
                        // Initial status on connection
                        console.log('[MaintenanceBanner] Received maintenance status via WebSocket');
                        if (message.data.isActive) {
                            this.showMaintenanceBanner(message.data);
                            this.maintenanceActive = true;
                        } else {
                            this.hideMaintenanceBanner();
                            this.maintenanceActive = false;
                        }
                    } else if (message.type === 'maintenance_status_changed') {
                        // Status changed
                        console.log('[MaintenanceBanner] Maintenance status changed via WebSocket');
                        if (message.data.isActive) {
                            this.showMaintenanceBanner(message.data);
                            this.maintenanceActive = true;
                        } else {
                            this.hideMaintenanceBanner();
                            this.maintenanceActive = false;
                        }
                    } else if (message.type === 'forced_logout') {
                        // User is being forced to logout
                        console.log('[MaintenanceBanner] Forced logout received via WebSocket');
                        this.handleForcedLogout(message.reason);
                    } else if (message.type === 'notification') {
                        // Generic notification
                        console.log('[MaintenanceBanner] Notification received:', message.title);
                        this.showNotification(message);
                    } else if (message.type === 'pong') {
                        // Heartbeat response
                        console.log('[MaintenanceBanner] Heartbeat pong received');
                    }
                } catch (err) {
                    console.error('[MaintenanceBanner] WebSocket message parse error:', err.message);
                }
            };

            ws.onerror = (error) => {
                console.error('[MaintenanceBanner] WebSocket error:', error);
            };

            ws.onclose = () => {
                console.log('[MaintenanceBanner] WebSocket closed, will retry polling');
                window.maintenanceWebSocket = null;
                // Polling will continue to keep banner up-to-date
            };

            // Send heartbeat every 30 seconds
            setInterval(() => {
                if (window.maintenanceWebSocket && window.maintenanceWebSocket.readyState === 1) {
                    window.maintenanceWebSocket.send(JSON.stringify({ type: 'ping' }));
                }
            }, 30000);

        } catch (err) {
            console.error('[MaintenanceBanner] WebSocket setup error:', err.message);
        }
    }

    /**
     * Handle forced logout message
     */
    handleForcedLogout(reason) {
        console.log('[MaintenanceBanner] Handling forced logout, reason:', reason);

        // Clear token
        localStorage.removeItem('token');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userRole');

        // Show alert
        alert(`Session telah ditutup: ${reason === 'maintenance_start' ? 'Sistem sedang dalam mode perbaikan' : reason}`);

        // Redirect to login
        window.location.href = '/index.html';
    }

    /**
     * Show generic notification
     */
    showNotification(notification) {
        // Use browser notification if available
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(notification.title, {
                body: notification.message,
                icon: '/img/logo.png'
            });
        }

        // Also log in console
        console.log(`[${notification.notificationType}] ${notification.title}: ${notification.message}`);
    }

    /**
     * Destroy banner and cleanup
     */
    destroy() {
        this.stopPolling();
        this.hideMaintenanceBanner();
        console.log('[MaintenanceBanner] Destroyed');
    }
}

// Global instance
let maintenanceBanner = null;

/**
 * Initialize maintenance banner on page load
 */
document.addEventListener('DOMContentLoaded', () => {
    maintenanceBanner = new MaintenanceBanner();
    maintenanceBanner.init();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (maintenanceBanner) {
        maintenanceBanner.destroy();
    }
});
