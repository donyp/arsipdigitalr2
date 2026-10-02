/**
 * CSRF Token Protection Middleware
 * Protects against Cross-Site Request Forgery attacks
 * Uses synchronizer token pattern (token in header or body)
 */

const crypto = require('crypto');
const SESSION_SECRET = process.env.SESSION_SECRET || 'default-session-secret';

// In-memory CSRF token store (for development)
// In production, should use Redis or database
const csrfTokenStore = new Map();

// Generate a new CSRF token
function generateCsrfToken(sessionId) {
    const token = crypto.randomBytes(32).toString('hex');
    csrfTokenStore.set(token, {
        sessionId,
        createdAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    });
    return token;
}

// Validate CSRF token
function validateCsrfToken(token, sessionId) {
    if (!token || !sessionId) {
        return false;
    }
    
    const tokenData = csrfTokenStore.get(token);
    
    if (!tokenData) {
        return false;
    }
    
    // Check if token belongs to this session
    if (tokenData.sessionId !== sessionId) {
        return false;
    }
    
    // Check if token is expired
    if (tokenData.expiresAt < Date.now()) {
        csrfTokenStore.delete(token);
        return false;
    }
    
    // Token is valid, delete it (one-time use)
    csrfTokenStore.delete(token);
    return true;
}

// Middleware to check CSRF token on state-changing requests
function csrfProtection() {
    return (req, res, next) => {
        // Skip CSRF check for safe methods
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            return next();
        }
        
        // Skip for public endpoints (share links, login)
        if (req.path.includes('/api/share/') || req.path === '/api/auth/login') {
            return next();
        }
        
        // Require authentication
        if (!req.user || !req.user.userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        // Get CSRF token from:
        // 1. X-CSRF-Token header
        // 2. csrf_token form field
        // 3. _csrf query parameter (not recommended)
        const token = req.headers['x-csrf-token'] || 
                      req.body?.csrf_token ||
                      req.query?._csrf;
        
        const sessionId = req.headers['x-session-token'] || 
                         req.user?.sessionId;
        
        if (!token || !sessionId) {
            return res.status(403).json({ 
                error: 'CSRF token missing',
                message: 'Include X-CSRF-Token header or csrf_token in body'
            });
        }
        
        if (!validateCsrfToken(token, sessionId)) {
            return res.status(403).json({ 
                error: 'CSRF token invalid or expired',
                message: 'Please refresh the page and try again'
            });
        }
        
        next();
    };
}

// Middleware to generate CSRF token for GET requests
function csrfTokenGen() {
    return (req, res, next) => {
        if (!req.user || !req.user.userId) {
            return next(); // No CSRF token for unauthenticated users
        }
        
        const sessionId = req.headers['x-session-token'] || req.user?.sessionId;
        if (!sessionId) {
            return next(); // No session, can't generate token
        }
        
        // Generate token and attach to response for GET requests
        const token = generateCsrfToken(sessionId);
        
        // Attach to response headers
        res.set('X-CSRF-Token', token);
        
        // Also make available in res.locals for templates
        res.locals.csrfToken = token;
        
        next();
    };
}

module.exports = {
    generateCsrfToken,
    validateCsrfToken,
    csrfProtection,
    csrfTokenGen
};
