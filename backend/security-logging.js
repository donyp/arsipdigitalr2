/**
 * Security-Safe Logging Utility
 * Prevents logging of sensitive data (tokens, passwords, secrets)
 * Production-safe logging with levels: error, warn, info, debug
 */

const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();

const LOG_LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};

// Check if this log level should be shown
function shouldLog(level) {
    const currentLevel = LOG_LEVELS[LOG_LEVEL] || LOG_LEVELS.info;
    return LOG_LEVELS[level] <= currentLevel;
}

// Sanitize sensitive fields from objects before logging
function sanitizeObject(obj, maxDepth = 2, currentDepth = 0) {
    if (currentDepth >= maxDepth) return '[depth limit]';
    if (!obj || typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item, maxDepth, currentDepth + 1));
    }
    
    const sensitiveFields = [
        'token', 'jwt', 'authorization', 'password', 'password_hash',
        'secret', 'api_key', 'apiKey', 'access_token', 'refresh_token',
        'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET', 'SESSION_SECRET',
        'CLOUDFLARE_ACCESS_KEY_ID', 'CLOUDFLARE_ACCESS_KEY_SECRET',
        'credit_card', 'ssn', 'social_security'
    ];
    
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
            sanitized[key] = '[REDACTED]';
        } else if (value && typeof value === 'object') {
            sanitized[key] = sanitizeObject(value, maxDepth, currentDepth + 1);
        } else {
            sanitized[key] = value;
        }
    }
    
    return sanitized;
}

/**
 * Safe error logging - for security/access errors only (no user data)
 * @param {string} tag - Log tag/prefix (e.g., '[AUTH]', '[UPLOAD]')
 * @param {string} message - Log message
 * @param {object} context - Additional context (will be sanitized)
 */
function logSecurityEvent(tag, message, context = {}) {
    if (!shouldLog('error') && !shouldLog('warn')) return;
    
    const timestamp = new Date().toISOString();
    const sanitized = sanitizeObject(context);
    
    console.error(`${timestamp} ${tag} [SECURITY] ${message}`, sanitized);
}

/**
 * Warning log - for deprecated features, configuration issues
 * @param {string} tag - Log tag
 * @param {string} message - Log message
 * @param {object} context - Additional context
 */
function logWarning(tag, message, context = {}) {
    if (!shouldLog('warn')) return;
    
    const timestamp = new Date().toISOString();
    const sanitized = sanitizeObject(context);
    
    console.warn(`${timestamp} ${tag} [WARN] ${message}`, sanitized);
}

/**
 * Info log - for normal operations
 * @param {string} tag - Log tag
 * @param {string} message - Log message
 * @param {object} context - Additional context (avoid sensitive data)
 */
function logInfo(tag, message, context = {}) {
    if (!shouldLog('info')) return;
    
    const timestamp = new Date().toISOString();
    const sanitized = sanitizeObject(context);
    
    console.log(`${timestamp} ${tag} [INFO] ${message}`, sanitized);
}

/**
 * Debug log - for development only (LOG_LEVEL=debug)
 * @param {string} tag - Log tag
 * @param {string} message - Log message
 * @param {object} context - Additional context
 */
function logDebug(tag, message, context = {}) {
    if (!shouldLog('debug')) return;
    
    const timestamp = new Date().toISOString();
    const sanitized = sanitizeObject(context);
    
    console.log(`${timestamp} ${tag} [DEBUG] ${message}`, sanitized);
}

/**
 * Audit log - for compliance and security events
 * Structure: action, user, resource, result, timestamp
 * @param {string} action - What happened (LOGIN, FILE_DOWNLOAD, PERMISSION_DENIED, etc)
 * @param {object} details - { userId, email, role, resource, result, reason }
 */
function logAudit(action, details = {}) {
    const timestamp = new Date().toISOString();
    const auditLog = {
        timestamp,
        action,
        userId: details.userId || 'unknown',
        email: details.email || 'unknown',
        role: details.role || 'unknown',
        resource: details.resource || null,
        result: details.result || 'unknown', // success, denied, error
        reason: details.reason || null,
        ip: details.ip || null,
        userAgent: details.userAgent || null
    };
    
    // Log to audit log file (separate from main logs)
    const auditMessage = JSON.stringify(auditLog);
    if (shouldLog('info')) {
        console.log(`${timestamp} [AUDIT] ${auditMessage}`);
    }
}

/**
 * Check if we should enable detailed logging (development mode)
 */
function isDebugMode() {
    return LOG_LEVEL === 'debug';
}

/**
 * Check if we should enable detailed logging (development mode)
 */
function isProduction() {
    return process.env.NODE_ENV === 'production';
}

module.exports = {
    logSecurityEvent,
    logWarning,
    logInfo,
    logDebug,
    logAudit,
    isDebugMode,
    isProduction,
    sanitizeObject,
    shouldLog
};
