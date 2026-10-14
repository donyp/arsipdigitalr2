/**
 * Session Status Checker Module
 * Polls server to detect if current session has been invalidated
 * (e.g., by forced logout, maintenance mode, etc.)
 * 
 * Automatically logs out user and redirects to login if session is invalid
 */

(function() {
    'use strict';

    const SESSION_CHECK_INTERVAL = 10 * 1000; // Normal: Check every 10 seconds
    const FAST_CHECK_INTERVAL = 2 * 1000; // Fast: Check every 2 seconds (untuk instant logout detection)
    const FAST_CHECK_DURATION = 30 * 1000; // Duration to use fast polling (30 seconds)
    let sessionCheckInterval = null;
    let isCheckingSession = false;

    /**
     * Check if current session is still valid on the server
     */
    async function checkSessionValidity() {
        if (isCheckingSession) return; // Prevent concurrent checks
        
        try {
            isCheckingSession = true;
            const token = localStorage.getItem('jwt_token') || localStorage.getItem('token');
            const sessionId = localStorage.getItem('current_session_id');
            
            if (!token || !sessionId) {
                console.log('[SessionStatusChecker] No token or session ID, skipping check');
                return;
            }

            // Call endpoint to verify session is still valid
            const response = await fetch('/api/maintenance/check-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    sessionId: sessionId
                })
            });

            if (response.status === 401 || response.status === 403) {
                // Session is invalid
                console.warn('[SessionStatusChecker] Session invalidated by server (401/403)');
                handleSessionInvalidated('Server returned 401/403');
                return;
            }

            if (!response.ok) {
                console.warn('[SessionStatusChecker] Failed to check session:', response.status);
                return;
            }

            const data = await response.json();
            console.log('[SessionStatusChecker] Session check response:', {
                isValid: data.isValid,
                maintenanceForcedLogout: data.maintenanceForcedLogout,
                message: data.message
            });
            
            if (!data.isValid) {
                console.warn('[SessionStatusChecker] Session marked as invalid on server (forced_logout: ' + data.maintenanceForcedLogout + ')');
                handleSessionInvalidated('Server marked session invalid');
                return;
            }

            // Uncomment for detailed logging: console.log('[SessionStatusChecker] Session is valid');
        } catch (error) {
            console.error('[SessionStatusChecker] Error checking session:', error.message);
        } finally {
            isCheckingSession = false;
        }
    }

    /**
     * Handle session invalidation - log out user and redirect to login
     */
    function handleSessionInvalidated() {
        console.log('[SessionStatusChecker] Handling session invalidation...');
        
        // Clear auth tokens
        localStorage.removeItem('jwt_token');
        localStorage.removeItem('token');
        localStorage.removeItem('current_session_id');
        sessionStorage.removeItem('current_session_id');
        
        // Stop session keepalive
        if (window.stopSessionKeepalive) {
            window.stopSessionKeepalive();
        }
        
        // Clear session ID
        if (window.clearSessionId) {
            window.clearSessionId();
        }
        
        // Stop checking
        if (sessionCheckInterval) {
            clearInterval(sessionCheckInterval);
            sessionCheckInterval = null;
        }
        
        // Show notification
        const message = 'Your session has been invalidated. Please log in again.';
        console.warn('[SessionStatusChecker]', message);
        
        // Redirect to login page
        setTimeout(() => {
            window.location.href = '/login.html?reason=session_invalidated&message=' + encodeURIComponent(message);
        }, 1000);
    }

    /**
     * Initialize session status checker
     * Call this after user has successfully logged in
     */
    window.initializeSessionStatusChecker = function() {
        try {
            const token = localStorage.getItem('jwt_token') || localStorage.getItem('token');
            if (!token) {
                console.log('[SessionStatusChecker] No token found, skipping initialization');
                return;
            }

            console.log('[SessionStatusChecker] Initialized - checking session with fast polling (2s) for first 30 seconds');
            
            // Clear previous interval if any
            if (sessionCheckInterval) {
                clearInterval(sessionCheckInterval);
            }

            // Perform initial check
            checkSessionValidity();
            
            // Use FAST polling for first 30 seconds, then switch to normal
            let checkCount = 0;
            const checksNeeded = FAST_CHECK_DURATION / FAST_CHECK_INTERVAL;
            
            sessionCheckInterval = setInterval(() => {
                checkSessionValidity();
                checkCount++;
                
                // Switch to normal polling after fast period
                if (checkCount >= checksNeeded) {
                    clearInterval(sessionCheckInterval);
                    console.log('[SessionStatusChecker] Switching to normal polling (10s)');
                    sessionCheckInterval = setInterval(checkSessionValidity, SESSION_CHECK_INTERVAL);
                }
            }, FAST_CHECK_INTERVAL);
        } catch (error) {
            console.error('[SessionStatusChecker] Error initializing:', error);
        }
    };

    /**
     * Stop session status checker
     * Call this when user logs out
     */
    window.stopSessionStatusChecker = function() {
        if (sessionCheckInterval) {
            clearInterval(sessionCheckInterval);
            sessionCheckInterval = null;
            console.log('[SessionStatusChecker] Stopped');
        }
    };

    console.log('[SessionStatusChecker] Module loaded - call initializeSessionStatusChecker() after login');
})();
