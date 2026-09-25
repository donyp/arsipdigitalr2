/**
 * Auto-Logout System - Frontend
 * 
 * This module handles:
 * 1. Periodic checking of logout time from backend
 * 2. Warning notification 5 minutes before logout
 * 3. Automatic logout when time is reached
 */

class AutoLogoutManager {
    constructor() {
        this.checkInterval = null;
        this.checkFrequencyMs = 5 * 60 * 1000; // Check every 5 minutes
        this.warningShown = false;
        this.isInitialized = false;
    }

    /**
     * Initialize the auto-logout system
     */
    async initialize() {
        if (this.isInitialized) return;
        
        console.log('[AutoLogout] Initializing auto-logout system...');
        
        try {
            // Initial check
            await this.checkLogoutTime();
            
            // Start periodic checks
            this.checkInterval = setInterval(() => {
                this.checkLogoutTime();
            }, this.checkFrequencyMs);
            
            this.isInitialized = true;
            console.log('[AutoLogout] Auto-logout system initialized. Checking every 5 minutes.');
        } catch (err) {
            console.error('[AutoLogout] Failed to initialize:', err.message);
        }
    }

    /**
     * Stop the auto-logout system
     */
    destroy() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.isInitialized = false;
        console.log('[AutoLogout] Auto-logout system stopped.');
    }

    /**
     * Check logout time from backend
     */
    async checkLogoutTime() {
        try {
            const response = await fetch('http://localhost:5000/api/auth/check-logout-time', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    // User is not authenticated, stop checking
                    this.destroy();
                    return;
                }
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            
            console.log('[AutoLogout] Check result:', {
                currentTime: data.currentTime,
                logoutTime: data.logoutTime,
                shouldLogout: data.shouldLogout,
                isWarningTime: data.isWarningTime,
                minutesUntilLogout: data.minutesUntilLogout
            });

            // If logout time has passed, logout immediately
            if (data.shouldLogout) {
                console.log('[AutoLogout] Logout time reached. Logging out...');
                await this.performLogout('Automatic logout at configured time');
                return;
            }

            // If within warning threshold, show warning
            if (data.isWarningTime && !this.warningShown) {
                this.showWarningNotification(data.minutesUntilLogout);
            }

            // If past warning threshold, reset warning flag
            if (!data.isWarningTime) {
                this.warningShown = false;
            }

        } catch (err) {
            console.error('[AutoLogout] Error checking logout time:', err.message);
        }
    }

    /**
     * Show warning notification before logout
     */
    showWarningNotification(minutesRemaining) {
        this.warningShown = true;
        
        const message = `Sistem akan logout otomatis dalam ${minutesRemaining} menit. Silakan simpan pekerjaan Anda.`;
        
        console.log('[AutoLogout] Showing warning:', message);

        // Use SweetAlert for warning
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Pemberitahuan Logout Otomatis',
                text: message,
                icon: 'warning',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timerProgressBar: true,
                timer: 8000,
                didOpen: (toast) => {
                    toast.addEventListener('mouseenter', Swal.stopTimer);
                    toast.addEventListener('mouseleave', Swal.resumeTimer);
                }
            });
        } else {
            // Fallback if SweetAlert not available
            alert(message);
        }
    }

    /**
     * Perform automatic logout
     */
    async performLogout(reason = 'Automatic logout') {
        try {
            // Call logout endpoint
            await fetch('http://localhost:5000/api/auth/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ reason })
            });
        } catch (err) {
            console.error('[AutoLogout] Error calling logout endpoint:', err.message);
        }

        // Clear local storage
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('sessionToken');

        // Show logout message
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Logout Otomatis',
                text: 'Anda telah logout otomatis. Silakan login kembali.',
                icon: 'info',
                confirmButtonText: 'OK'
            }).then(() => {
                window.location.href = '/';
            });
        } else {
            alert('Anda telah logout otomatis. Silakan login kembali.');
            window.location.href = '/';
        }
    }
}

// Create global instance
const autoLogoutManager = new AutoLogoutManager();

// Initialize when user is authenticated
function initializeAutoLogoutIfNeeded() {
    const token = localStorage.getItem('token');
    const currentUser = localStorage.getItem('user');
    
    if (token && currentUser && !autoLogoutManager.isInitialized) {
        autoLogoutManager.initialize();
    } else if (!token && autoLogoutManager.isInitialized) {
        autoLogoutManager.destroy();
    }
}

// Check on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeAutoLogoutIfNeeded();
});

// Re-check when storage changes (in case logout happens in another tab)
window.addEventListener('storage', (event) => {
    if (event.key === 'token') {
        initializeAutoLogoutIfNeeded();
    }
});
