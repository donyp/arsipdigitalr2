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
        if (isCheckingSession) return;
        
        try {
            isCheckingSession = true;
            const token = localStorage.getItem('jwt_token') || localStorage.getItem('token');
            const sessionId = localStorage.getItem('current_session_id');
            
            if (!token || !sessionId) {
                return;
            }

            // Silent call - no console logging
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
                handleSessionInvalidated('Server returned 401/403');
                return;
            }

            if (!response.ok) {
                return;
            }

            const data = await response.json();
            
            if (!data.isValid) {
                handleSessionInvalidated('Server marked session invalid');
                return;
            }
        } catch (error) {
            // Silent error - no logging
        } finally {
            isCheckingSession = false;
        }
    }

    /**
     * Handle session invalidation - log out user and redirect to login
     */
    function handleSessionInvalidated(reason) {
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
        
        // Redirect to login page (clean URL, no query params)
        window.location.href = '/index.html';
    }

    /**
     * Initialize session status checker
     * Call this after user has successfully logged in
     */
    window.initializeSessionStatusChecker = function() {
        try {
            const token = localStorage.getItem('jwt_token') || localStorage.getItem('token');
            if (!token) {
                return;
            }

            // Clear previous interval if any
            if (sessionCheckInterval) {
                clearInterval(sessionCheckInterval);
            }

            // Perform initial check immediately
            checkSessionValidity();
            
            // Use FAST polling for first 30 seconds, then switch to normal
            let checkCount = 0;
            const checksNeeded = FAST_CHECK_DURATION / FAST_CHECK_INTERVAL;
            
            sessionCheckInterval = setInterval(() => {
                checkCount++;
                checkSessionValidity();
                
                // Switch to normal polling after fast period
                if (checkCount >= checksNeeded) {
                    clearInterval(sessionCheckInterval);
                    sessionCheckInterval = setInterval(checkSessionValidity, SESSION_CHECK_INTERVAL);
                }
            }, FAST_CHECK_INTERVAL);
        } catch (error) {
            // Silent initialization
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
        }
    };

    console.log('[SessionStatusChecker] Module loaded');

})();
