/**
 * API Module - Wrapper for API calls with authentication
 */

const API = {
    /**
     * Get JWT token from localStorage
     */
    getToken() {
        return localStorage.getItem('jwt_token') || null;
    },

    /**
     * Set JWT token to localStorage
     */
    setToken(token) {
        if (token) {
            localStorage.setItem('jwt_token', token);
        } else {
            localStorage.removeItem('jwt_token');
        }
    },

    /**
     * Make GET request
     */
    async get(url, options = {}) {
        const token = this.getToken();
        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        };

        // Prepend backend URL if not absolute
        const fullUrl = url.startsWith('http') ? url : `http://localhost:5000${url}`;

        const response = await fetch(fullUrl, {
            method: 'GET',
            headers,
            ...options
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        return response.json();
    },

    /**
     * Make POST request
     */
    async post(url, data = {}, options = {}) {
        const token = this.getToken();
        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        };

        // Prepend backend URL if not absolute
        const fullUrl = url.startsWith('http') ? url : `http://localhost:5000${url}`;

        const response = await fetch(fullUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
            ...options
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `API Error: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Make POST request with FormData (for file uploads)
     */
    async postFormData(url, formData, options = {}) {
        const token = this.getToken();
        const headers = {
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        };

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: formData,
            ...options
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `API Error: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Make PUT request
     */
    async put(url, data = {}, options = {}) {
        const token = this.getToken();
        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        };

        // Prepend backend URL if not absolute
        const fullUrl = url.startsWith('http') ? url : `http://localhost:5000${url}`;

        const response = await fetch(fullUrl, {
            method: 'PUT',
            headers,
            body: JSON.stringify(data),
            ...options
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        return response.json();
    },

    /**
     * Make DELETE request
     */
    async delete(url, options = {}) {
        const token = this.getToken();
        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        };

        // Prepend backend URL if not absolute
        const fullUrl = url.startsWith('http') ? url : `http://localhost:5000${url}`;

        const response = await fetch(fullUrl, {
            method: 'DELETE',
            headers,
            ...options
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        return response.json();
    },

    /**
     * Clear authentication data
     */
    clearAuth() {
        localStorage.removeItem('jwt_token');
        localStorage.removeItem('user_data');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    },

    /**
     * Set authentication (token + user)
     */
    setAuth(token, user) {
        this.setToken(token);
        localStorage.setItem('user', JSON.stringify(user));
    },

    /**
     * Get session ID
     */
    getSessionId() {
        return localStorage.getItem('sessionToken') || 'session-' + Date.now();
    }
};

// Export for Node.js if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
}
