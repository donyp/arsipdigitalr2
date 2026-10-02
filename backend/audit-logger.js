/**
 * audit-logger.js
 * Helper untuk mencatat semua aktivitas penting ke audit_logs table
 * Digunakan oleh semua endpoint untuk compliance dan monitoring
 */

class AuditLogger {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
    }

    /**
     * Log aktivitas ke database
     * @param {Object} options - Log data
     */
    async log({
        userId,
        userEmail,
        userRole,
        zonaId,
        action, // 'User login', 'Invoice downloaded', 'File deleted', etc
        resourceType, // 'invoice', 'file', 'user', 'zona', 'ticket', etc
        resourceId,
        resourceName,
        operation, // 'CREATE', 'READ', 'UPDATE', 'DELETE', 'DOWNLOAD'
        oldValues = null,
        newValues = null,
        ipAddress,
        userAgent,
        requestPath,
        requestMethod,
        statusCode,
        responseMessage = null,
        errorMessage = null,
        isSuspicious = false,
        severity = 'info' // 'info', 'warning', 'critical'
    }) {
        try {
            // Validate required fields - userId can be null for failed attempts
            if (!action || !resourceType || !operation) {
                console.warn('[AuditLogger] Missing required fields (action, resourceType, operation), skipping log');
                return null;
            }

            // Sanitasi IP address jika ada
            const sanitizedIp = ipAddress ? this._sanitizeIp(ipAddress) : null;

            // Detect suspicious activity
            const detectSuspicious = isSuspicious || this._detectSuspiciousPattern({
                operation,
                statusCode,
                resourceType,
                oldValues,
                newValues
            });

            // Tentukan severity
            let detectedSeverity = severity;
            if (detectSuspicious) {
                detectedSeverity = statusCode >= 400 ? 'critical' : 'warning';
            }

            const { data, error } = await this.supabase
                .from('audit_logs')
                .insert({
                    user_id: userId,
                    user_email: userEmail,
                    user_role: userRole,
                    zona_id: zonaId,
                    action,
                    resource_type: resourceType,
                    resource_id: resourceId,
                    resource_name: resourceName,
                    operation,
                    old_values: oldValues,
                    new_values: newValues,
                    ip_address: sanitizedIp,
                    user_agent: userAgent ? userAgent.substring(0, 255) : null,
                    request_path: requestPath,
                    request_method: requestMethod,
                    status_code: statusCode,
                    response_message: responseMessage,
                    error_message: errorMessage,
                    is_suspicious: detectSuspicious,
                    severity: detectedSeverity
                })
                .select('id')
                .single();

            if (error) {
                console.error('[AuditLogger] Failed to insert log:', error.message);
                return null;
            }

            // Alert if suspicious
            if (detectSuspicious) {
                console.warn('[SUSPICIOUS] Audit log flagged:', {
                    userId,
                    action,
                    resourceType,
                    operation,
                    severity: detectedSeverity
                });
            }

            return data;
        } catch (err) {
            console.error('[AuditLogger] Error logging audit:', err.message);
            return null;
        }
    }

    /**
     * Detect suspicious patterns
     */
    _detectSuspiciousPattern({ operation, statusCode, resourceType, oldValues, newValues }) {
        // Multiple failed attempts
        if (statusCode >= 400 && statusCode !== 404) {
            return true;
        }

        // Bulk delete operations
        if (operation === 'DELETE' && resourceType === 'file') {
            return true;
        }

        // Data modification by non-owner
        if (operation === 'UPDATE' && oldValues && newValues) {
            // Check if critical fields changed
            const criticalFields = ['status', 'role', 'zona_id', 'permissions'];
            const changed = criticalFields.filter(f => oldValues[f] !== newValues[f]);
            if (changed.length > 0) {
                return true;
            }
        }

        return false;
    }

    /**
     * Sanitize IP address (remove port if present)
     */
    _sanitizeIp(ip) {
        return ip.split(':')[0];
    }

    /**
     * Helper untuk extract client info dari Express request
     */
    static extractClientInfo(req) {
        const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                         req.headers['x-real-ip'] ||
                         req.ip ||
                         '0.0.0.0';

        const userAgent = req.headers['user-agent'] || 'Unknown';

        return { ipAddress, userAgent };
    }

    /**
     * Helper untuk extract user info dari JWT
     */
    static extractUserInfo(req) {
        if (!req.user) {
            return {
                userId: null,
                userEmail: null,
                userRole: null,
                zonaId: null
            };
        }

        return {
            userId: req.user.userId,
            userEmail: req.user.email,
            userRole: req.user.role,
            zonaId: req.user.zona_id
        };
    }
}

module.exports = AuditLogger;
