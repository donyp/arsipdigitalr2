/**
 * Comprehensive Error Handler Middleware
 * Sanitizes errors before sending to client (prevents error disclosure)
 * 
 * Security: Hides stack traces, sensitive info in production
 */

module.exports = function errorHandler(err, req, res, next) {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const statusCode = err.statusCode || err.status || 500;
    const requestId = req.id || `req-${Date.now()}`;

    // ============================================================
    // LOG FULL ERROR ON SERVER (for debugging)
    // ============================================================
    const errorLog = {
        timestamp: new Date().toISOString(),
        requestId,
        statusCode,
        method: req.method,
        path: req.path,
        userId: req.user?.id || 'anonymous',
        ip: req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress,
        error: {
            message: err.message,
            code: err.code,
            name: err.name
        }
    };

    if (isDevelopment) {
        errorLog.error.stack = err.stack;
        errorLog.error.details = err.details;
    }

    console.error('[ERROR_HANDLER]', JSON.stringify(errorLog, null, 2));

    // ============================================================
    // CONSTRUCT SANITIZED CLIENT RESPONSE
    // ============================================================
    const clientResponse = {
        error: getSafeErrorMessage(err, isDevelopment),
        statusCode,
        timestamp: new Date().toISOString(),
        requestId
    };

    // Include request path for debugging (safe)
    if (isDevelopment) {
        clientResponse.path = req.path;
    }

    // Include error code if safe
    if (isDevelopment && err.code) {
        clientResponse.code = err.code;
    }

    // Include stack trace ONLY in development
    if (isDevelopment && err.stack) {
        clientResponse.stack = err.stack.split('\n').filter(line => line.trim());
    }

    // For specific error types, include safe details
    if (statusCode === 400 && isDevelopment) {
        clientResponse.details = err.details;
    }

    res.status(statusCode).json(clientResponse);
};

/**
 * Get safe error message for client
 * Hides sensitive details in production
 */
function getSafeErrorMessage(err, isDevelopment) {
    const message = err.message || 'Unknown error';

    // Production: Generic message unless it's a known safe error
    if (!isDevelopment) {
        // Safe to return these specific error types
        if (err.code === 'VALIDATION_ERROR' || message.includes('validation')) {
            return message.replace(/password|secret|key|token/gi, '***');
        }
        
        if (err.code === 'NOT_FOUND' || message.includes('not found')) {
            return 'Resource not found';
        }
        
        if (err.code === 'UNAUTHORIZED' || message.includes('unauthorized')) {
            return 'Unauthorized access';
        }
        
        if (err.code === 'FORBIDDEN' || message.includes('forbidden')) {
            return 'Access denied';
        }

        if (err.code === 'CONFLICT' || message.includes('duplicate')) {
            return 'Operation cannot be completed';
        }

        if (statusCode >= 500) {
            return 'Internal server error';
        }

        // Generic fallback
        return 'An error occurred';
    }

    // Development: Return message but sanitize sensitive paths
    return message
        .replace(/\/home\/[^/]+/g, '/home/***')
        .replace(/\/var\/[^/]+/g, '/var/***')
        .replace(/C:\\Users\\[^\\]+/g, 'C:\\Users\\***')
        .replace(/process\.env\.\w+/g, 'ENV_VAR')
        .replace(/password[=:].*?[,}]$/gi, 'password: ***')
        .replace(/secret[=:].*?[,}]$/gi, 'secret: ***')
        .replace(/token[=:].*?[,}]$/gi, 'token: ***')
        .replace(/key[=:].*?[,}]$/gi, 'key: ***');
}

/**
 * Handle specific error types with custom messages
 */
module.exports.handleValidationError = (field, constraint) => {
    const errors = {
        zona_id: 'Invalid zona ID format',
        date_from: 'Invalid date format (use YYYY-MM-DD)',
        date_to: 'Invalid date format (use YYYY-MM-DD)',
        category: 'Invalid category',
        filename: 'Invalid filename',
        email: 'Invalid email format',
        password: 'Password must be at least 8 characters'
    };

    return errors[field] || 'Invalid input';
};

/**
 * Handle database errors
 */
module.exports.handleDatabaseError = (err, isDevelopment) => {
    const code = err.code || 'UNKNOWN';

    if (!isDevelopment) {
        // Hide database details
        if (code === '23505') return 'Duplicate entry';  // Unique constraint
        if (code === '23503') return 'Invalid reference';  // Foreign key
        if (code === '42P01') return 'Operation failed';  // Table not found
        return 'Database operation failed';
    }

    // Development: include more details
    const messages = {
        '23505': 'Duplicate value violation',
        '23503': 'Foreign key constraint violation',
        '42P01': 'Table does not exist',
        '42703': 'Column does not exist'
    };

    return messages[code] || err.message;
};

/**
 * Handle file upload errors
 */
module.exports.handleFileError = (err, isDevelopment) => {
    if (err.code === 'FILE_TOO_LARGE') {
        return 'File too large (max 100MB)';
    }

    if (err.code === 'INVALID_FILE_TYPE') {
        return 'Invalid file type. Only PDF files allowed.';
    }

    if (err.code === 'INVALID_FILENAME') {
        return 'Invalid filename';
    }

    if (isDevelopment) {
        return err.message;
    }

    return 'File operation failed';
};

/**
 * Handle authentication errors
 */
module.exports.handleAuthError = (err) => {
    const messages = {
        'TokenExpiredError': 'Session expired. Please login again.',
        'JsonWebTokenError': 'Invalid authentication token.',
        'UnauthorizedError': 'Missing or invalid authentication.',
        'AUTH_FAILED': 'Authentication failed. Check your credentials.',
        'USER_INACTIVE': 'Your account has been deactivated.'
    };

    return messages[err.name] || messages[err.code] || 'Authentication failed';
};
