/**
 * Session Keep-Alive Module
 * Automatically updates session activity to keep it alive
 * Prevents sessions from being marked as stale/inactive
 */

(function() {
    'use strict';

    const SESSION_KEEPALIVE_INTERVAL = 5 * 60 * 1000; // 5 minutes
    const SESSION_STORAGE_KEY = 'current_session_id';
    let keepaliveInterval = null;

    /**
     * Initialize session keep-alive
     * Call this after user has successfully logged in
     */
    window.initializeSessionKeepalive = function() {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                console.warn('[SessionKeepalive] No token found, skipping initialization');
                return;
            }

            // Get session ID from localStorage or sessionStorage
            let sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
            if (!sessionId) {
                sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY);
            }

            if (!sessionId) {
                console.warn('[SessionKeepalive] No session ID found in localStorage or sessionStorage');
                console.warn('[SessionKeepalive] Available localStorage keys:', Object.keys(localStorage).filter(k => k.includes('session') || k.includes('token') || k.includes('jwt')));
                return;
            }

            // Clear previous interval if any
            if (keepaliveInterval) {
                clearInterval(keepaliveInterval);
            }

            // Send initial ping immediately
            pingSessionActivity(sessionId, token);

            // Set up regular pings
            keepaliveInterval = setInterval(() => {
                pingSessionActivity(sessionId, token);
            }, SESSION_KEEPALIVE_INTERVAL);

            console.log('[SessionKeepalive] Initialized with interval:', SESSION_KEEPALIVE_INTERVAL, 'ms');

        } catch (error) {
            console.error('[SessionKeepalive] Initialization error:', error);
        }
    };

    /**
     * Send session activity ping to server
     */
    async function pingSessionActivity(sessionId, token) {
        try {
            const response = await fetch(`/api/maintenance/active-sessions/${sessionId}/update-activity`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                console.warn('[SessionKeepalive] Ping failed:', response.status, response.statusText);
                
                // If 401, token is invalid - user should re-login
                if (response.status === 401) {
                    console.error('[SessionKeepalive] Token invalid - session expired');
                    stopSessionKeepalive();
                }
                return;
            }

            const data = await response.json();
            console.log('[SessionKeepalive] Ping successful at:', data.last_activity);

        } catch (error) {
            console.error('[SessionKeepalive] Ping error:', error);
        }
    }

    /**
     * Stop session keep-alive
     * Call this when user logs out
     */
    window.stopSessionKeepalive = function() {
        if (keepaliveInterval) {
            clearInterval(keepaliveInterval);
            keepaliveInterval = null;
            console.log('[SessionKeepalive] Stopped');
        }
    };

    /**
     * Store session ID (called by login endpoint)
     */
    window.setSessionId = function(sessionId) {
        try {
            localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
            console.log('[SessionKeepalive] Session ID stored:', sessionId);
        } catch (error) {
            console.warn('[SessionKeepalive] Could not store session ID:', error);
        }
    };

    /**
     * Get current session ID
     */
    window.getSessionId = function() {
        return localStorage.getItem(SESSION_STORAGE_KEY) || sessionStorage.getItem(SESSION_STORAGE_KEY);
    };

    /**
     * Clear session ID (called on logout)
     */
    window.clearSessionId = function() {
        try {
            localStorage.removeItem(SESSION_STORAGE_KEY);
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
            console.log('[SessionKeepalive] Session ID cleared');
        } catch (error) {
            console.warn('[SessionKeepalive] Could not clear session ID:', error);
        }
    };

    console.log('[SessionKeepalive] Module loaded - call initializeSessionKeepalive() after login');

})();
