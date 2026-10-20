/**
 * Universal Input Validation Middleware
 * Sanitizes ALL user input across all endpoints
 * 
 * Security Fix #3: Prevents injection attacks, XSS, path traversal
 */

const {
    sanitizeString,
    validateZonaId,
    validateDate,
    validatePagination,
    validateCategory,
    validateId
} = require('../input-validators');

module.exports = function universalInputValidation(req, res, next) {
    try {
        // ============================================================
        // SANITIZE QUERY PARAMETERS
        // ============================================================
        if (req.query && Object.keys(req.query).length > 0) {
            Object.keys(req.query).forEach(key => {
                const value = req.query[key];
                
                // Handle string values
                if (typeof value === 'string') {
                    req.query[key] = sanitizeString(value, 500);
                }
                
                // Handle array values (e.g., ?tag=a&tag=b)
                if (Array.isArray(value)) {
                    req.query[key] = value.map(v => 
                        typeof v === 'string' ? sanitizeString(v, 500) : v
                    );
                }
            });
            
            // Specific field validations for common query params
            if (req.query.zona_id !== undefined) {
                req.query.zona_id = validateZonaId(req.query.zona_id);
            }
            
            if (req.query.date_from !== undefined) {
                req.query.date_from = validateDate(req.query.date_from);
            }
            
            if (req.query.date_to !== undefined) {
                req.query.date_to = validateDate(req.query.date_to);
            }
            
            if (req.query.category !== undefined) {
                req.query.category = validateCategory(req.query.category);
            }
            
            if (req.query.id !== undefined) {
                req.query.id = validateId(req.query.id);
            }
            
            // Pagination
            if (req.query.limit !== undefined || req.query.offset !== undefined) {
                const { limit, offset } = validatePagination(
                    req.query.limit,
                    req.query.offset
                );
                req.query.limit = limit;
                req.query.offset = offset;
            }
            
            // Search parameter - limit length
            if (req.query.search !== undefined && typeof req.query.search === 'string') {
                req.query.search = sanitizeString(req.query.search.trim(), 200);
            }
            
            // Status field - whitelist known values
            if (req.query.status !== undefined) {
                const validStatuses = ['pending', 'completed', 'failed', 'active', 'inactive', 'unread', 'read'];
                if (typeof req.query.status === 'string') {
                    req.query.status = validStatuses.includes(req.query.status.toLowerCase()) 
                        ? req.query.status.toLowerCase() 
                        : null;
                }
            }
        }
        
        // ============================================================
        // SANITIZE REQUEST BODY
        // ============================================================
        if (req.body && typeof req.body === 'object') {
            Object.keys(req.body).forEach(key => {
                const value = req.body[key];
                
                // Sanitize strings
                if (typeof value === 'string') {
                    req.body[key] = sanitizeString(value, 2000);
                }
                
                // Sanitize array of strings
                if (Array.isArray(value)) {
                    req.body[key] = value.map(v =>
                        typeof v === 'string' ? sanitizeString(v, 1000) : v
                    );
                }
                
                // Sanitize nested objects (one level deep)
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    Object.keys(value).forEach(nestedKey => {
                        if (typeof value[nestedKey] === 'string') {
                            value[nestedKey] = sanitizeString(value[nestedKey], 1000);
                        }
                    });
                }
            });
            
            // Specific field validations
            if (req.body.zona_id !== undefined) {
                req.body.zona_id = validateZonaId(req.body.zona_id);
            }
            
            if (req.body.category !== undefined) {
                req.body.category = validateCategory(req.body.category);
            }
            
            if (req.body.tanggal !== undefined) {
                req.body.tanggal = validateDate(req.body.tanggal);
            }
            
            // Ensure title/content have reasonable size limits
            if (req.body.title !== undefined && typeof req.body.title === 'string') {
                req.body.title = sanitizeString(req.body.title.trim(), 200);
                if (!req.body.title) {
                    return res.status(400).json({ error: 'Title cannot be empty' });
                }
            }
            
            if (req.body.content !== undefined && typeof req.body.content === 'string') {
                req.body.content = sanitizeString(req.body.content.trim(), 5000);
            }
        }
        
        // ============================================================
        // SANITIZE PATH PARAMETERS
        // ============================================================
        if (req.params && Object.keys(req.params).length > 0) {
            Object.keys(req.params).forEach(key => {
                const value = req.params[key];
                
                if (typeof value === 'string') {
                    // Try to validate as ID first (UUID or number)
                    const validated = validateId(value);
                    if (validated !== null) {
                        req.params[key] = validated;
                    } else {
                        // If not an ID, sanitize as general string
                        req.params[key] = sanitizeString(value, 500);
                    }
                }
            });
        }
        
        // ============================================================
        // CHECK FOR SUSPICIOUS PATTERNS
        // ============================================================
        const allInput = JSON.stringify({
            query: req.query,
            body: req.body,
            params: req.params
        });
        
        // SQL injection patterns
        const sqlPatterns = /(\bOR\b|\bDROP\b|\bDELETE\b|\bINSERT\b|\bUNION\b|--|\*\/|\#)/gi;
        if (sqlPatterns.test(allInput)) {
            console.warn(`[Input Validation] Suspicious SQL pattern detected from ${req.user?.id || req.ip}`);
            // Don't block, but log for monitoring
        }
        
        // XSS patterns
        const xssPatterns = /(<script[^>]*>|javascript:|onerror=|onload=)/gi;
        if (xssPatterns.test(allInput)) {
            console.warn(`[Input Validation] Suspicious XSS pattern detected from ${req.user?.id || req.ip}`);
        }
        
        next();
    } catch (error) {
        console.error('[Input Validation] Error during validation:', error.message);
        return res.status(400).json({ 
            error: 'Invalid input format',
            ...(process.env.NODE_ENV === 'development' && { debug: error.message })
        });
    }
};
