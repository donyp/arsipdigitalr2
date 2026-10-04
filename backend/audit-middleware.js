/**
 * audit-middleware.js
 * Middleware untuk enhanced audit logging di berbagai endpoints
 * Menyediakan helpers dan wrappers untuk mudah di-integrate
 */

const EnhancedAuditLogger = require('./audit-logger-enhanced');

/**
 * Factory untuk membuat audit middleware
 */
function createAuditMiddleware(supabase) {
    const auditLogger = new EnhancedAuditLogger(supabase);

    return {
        /**
         * Wrapper untuk route handlers yang perlu audit logging
         * Gunakan untuk resource-specific endpoints
         */
        auditRoute: (resourceType, operation) => {
            return async (req, res, next) => {
                // Store audit context di req untuk digunakan di handler
                req.auditContext = {
                    resourceType,
                    operation,
                    auditLogger,
                    startTime: Date.now()
                };

                // Intercept response untuk auto-log
                const originalJson = res.json;
                const originalStatus = res.status;
                let statusCode = 200;

                res.status = function(code) {
                    statusCode = code;
                    return originalStatus.call(this, code);
                };

                res.json = function(data) {
                    // Log akan dilakukan oleh handler
                    // Ini hanya untuk fallback jika handler lupa
                    return originalJson.call(this, data);
                };

                req.auditContext.statusCode = statusCode;
                next();
            };
        },

        /**
         * Helper untuk log resource creation
         */
        logCreate: async (req, resourceData) => {
            const { resourceType, operation } = req.auditContext;
            const { ipAddress, userAgent } = EnhancedAuditLogger.extractClientInfo(req);
            const { userId, userEmail, userRole, zonaId } = EnhancedAuditLogger.extractUserInfo(req);

            return await auditLogger.logWithContext({
                userId,
                userEmail,
                userRole,
                zonaId,
                resourceType,
                resourceId: resourceData.id,
                resourceName: resourceData.name || `${resourceType} ${resourceData.id}`,
                operation,
                context: resourceData.context || {},
                newValues: resourceData.values || {},
                ipAddress,
                userAgent,
                requestPath: req.path,
                requestMethod: req.method,
                statusCode: 201
            });
        },

        /**
         * Helper untuk log resource update
         */
        logUpdate: async (req, resourceData) => {
            const { resourceType, operation } = req.auditContext;
            const { ipAddress, userAgent } = EnhancedAuditLogger.extractClientInfo(req);
            const { userId, userEmail, userRole, zonaId } = EnhancedAuditLogger.extractUserInfo(req);

            return await auditLogger.logWithContext({
                userId,
                userEmail,
                userRole,
                zonaId,
                resourceType,
                resourceId: resourceData.id,
                resourceName: resourceData.name || `${resourceType} ${resourceData.id}`,
                operation,
                context: resourceData.context || {},
                oldValues: resourceData.oldValues || {},
                newValues: resourceData.newValues || {},
                ipAddress,
                userAgent,
                requestPath: req.path,
                requestMethod: req.method,
                statusCode: 200
            });
        },

        /**
         * Helper untuk log resource deletion
         */
        logDelete: async (req, resourceData) => {
            const { resourceType, operation } = req.auditContext;
            const { ipAddress, userAgent } = EnhancedAuditLogger.extractClientInfo(req);
            const { userId, userEmail, userRole, zonaId } = EnhancedAuditLogger.extractUserInfo(req);

            return await auditLogger.logWithContext({
                userId,
                userEmail,
                userRole,
                zonaId,
                resourceType,
                resourceId: resourceData.id,
                resourceName: resourceData.name || `${resourceType} ${resourceData.id}`,
                operation,
                context: resourceData.context || {},
                oldValues: resourceData.values || {},
                ipAddress,
                userAgent,
                requestPath: req.path,
                requestMethod: req.method,
                statusCode: 200,
                isSuspicious: resourceData.isSuspicious || false
            });
        },

        /**
         * Helper untuk log download
         */
        logDownload: async (req, resourceData) => {
            const { resourceType } = req.auditContext;
            const { ipAddress, userAgent } = EnhancedAuditLogger.extractClientInfo(req);
            const { userId, userEmail, userRole, zonaId } = EnhancedAuditLogger.extractUserInfo(req);

            return await auditLogger.logWithContext({
                userId,
                userEmail,
                userRole,
                zonaId,
                resourceType,
                resourceId: resourceData.id,
                resourceName: resourceData.name || `${resourceType} ${resourceData.id}`,
                operation: 'DOWNLOAD',
                context: resourceData.context || {},
                newValues: {
                    filename: resourceData.filename,
                    ukuran: resourceData.size
                },
                ipAddress,
                userAgent,
                requestPath: req.path,
                requestMethod: req.method,
                statusCode: 200
            });
        },

        /**
         * Helper untuk log bulk operations
         */
        logBulkOperation: async (req, resourceData) => {
            const { resourceType } = req.auditContext;
            const { ipAddress, userAgent } = EnhancedAuditLogger.extractClientInfo(req);
            const { userId, userEmail, userRole, zonaId } = EnhancedAuditLogger.extractUserInfo(req);

            return await auditLogger.logWithContext({
                userId,
                userEmail,
                userRole,
                zonaId,
                resourceType,
                resourceId: null,
                resourceName: `Bulk ${resourceData.operation} - ${resourceData.count} items`,
                operation: `BULK_${resourceData.operation.toUpperCase()}`,
                context: {
                    jumlah: resourceData.count,
                    total_size: resourceData.totalSize,
                    detail: resourceData.detail || ''
                },
                newValues: {
                    jumlah: resourceData.count,
                    total_size: resourceData.totalSize
                },
                ipAddress,
                userAgent,
                requestPath: req.path,
                requestMethod: req.method,
                statusCode: 200,
                isSuspicious: resourceData.count > 50
            });
        },

        /**
         * Helper untuk log user authentication
         */
        logAuth: async (req, authData) => {
            const { ipAddress, userAgent } = EnhancedAuditLogger.extractClientInfo(req);
            const { userId, userEmail, userRole, zonaId } = EnhancedAuditLogger.extractUserInfo(req);

            return await auditLogger.logWithContext({
                userId,
                userEmail: authData.email || userEmail,
                userRole,
                zonaId,
                resourceType: 'user',
                resourceId: authData.userId || userId,
                resourceName: authData.email || userEmail,
                operation: authData.operation || 'LOGIN', // LOGIN, LOGOUT, PASSWORD_CHANGE
                context: authData.context || {},
                newValues: {
                    email: authData.email,
                    metode_login: authData.metode || 'email_password'
                },
                ipAddress,
                userAgent,
                requestPath: req.path,
                requestMethod: req.method,
                statusCode: authData.statusCode || 200,
                isSuspicious: authData.isSuspicious || false
            });
        },

        /**
         * Helper untuk log system actions
         */
        logSystem: async (req, systemData) => {
            const { ipAddress, userAgent } = EnhancedAuditLogger.extractClientInfo(req);
            const { userId, userEmail, userRole, zonaId } = EnhancedAuditLogger.extractUserInfo(req);

            return await auditLogger.logWithContext({
                userId,
                userEmail,
                userRole,
                zonaId,
                resourceType: 'system',
                resourceId: systemData.configKey || 'system',
                resourceName: systemData.configKey || 'System Action',
                operation: systemData.operation || 'CONFIG_CHANGE',
                context: systemData.context || {},
                oldValues: systemData.oldValues || {},
                newValues: systemData.newValues || {},
                ipAddress,
                userAgent,
                requestPath: req.path,
                requestMethod: req.method,
                statusCode: 200
            });
        },

        /**
         * Shorthand untuk direct logging tanpa middleware
         */
        log: auditLogger.logWithContext.bind(auditLogger),

        /**
         * Get logger instance jika perlu akses langsung
         */
        getLogger: () => auditLogger
    };
}

module.exports = createAuditMiddleware;
