/**
 * audit-endpoints.js
 * API endpoints untuk Audit Logs Dashboard
 * Hanya accessible oleh moderator dan super_admin
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const AuditLogger = require('./audit-logger');

module.exports = function registerAuditEndpoints(app, supabase, authenticateToken, authorizeRole) {
    /**
     * GET /api/audit-logs
     * List semua audit logs dengan filtering
     * Query params:
     *   - userId: filter by user ID
     *   - resourceType: filter by resource type (invoice, file, user, zona, ticket)
     *   - operation: filter by operation (CREATE, READ, UPDATE, DELETE, DOWNLOAD)
     *   - startDate: filter by start date (ISO 8601)
     *   - endDate: filter by end date (ISO 8601)
     *   - severity: filter by severity (info, warning, critical)
     *   - isSuspicious: filter by suspicious status (true/false)
     *   - limit: results per page (default: 50, max: 500)
     *   - offset: pagination offset (default: 0)
     *   - sortBy: sort field (created_at, severity)
     *   - sortOrder: sort direction (asc, desc)
     */
    app.get('/api/audit-logs', authenticateToken, authorizeRole('moderator', 'super_admin'), async (req, res) => {
        try {
            const {
                userId,
                resourceType,
                operation,
                startDate,
                endDate,
                severity,
                isSuspicious,
                limit = 50,
                offset = 0,
                sortBy = 'created_at',
                sortOrder = 'desc'
            } = req.query;

            // Validate pagination
            const parsedLimit = Math.min(parseInt(limit) || 50, 500);
            const parsedOffset = parseInt(offset) || 0;

            // Start query
            let query = supabase.from('audit_logs').select('*', { count: 'exact' });

            // Apply filters
            if (userId) {
                query = query.eq('user_id', userId);
            }
            if (resourceType) {
                query = query.eq('resource_type', resourceType);
            }
            if (operation) {
                query = query.eq('operation', operation);
            }
            if (severity) {
                query = query.eq('severity', severity);
            }
            if (isSuspicious === 'true' || isSuspicious === true) {
                query = query.eq('is_suspicious', true);
            } else if (isSuspicious === 'false' || isSuspicious === false) {
                query = query.eq('is_suspicious', false);
            }

            // Date range filter
            if (startDate) {
                try {
                    const start = new Date(startDate).toISOString();
                    query = query.gte('created_at', start);
                } catch (e) {
                    return res.status(400).json({ error: 'Invalid startDate format' });
                }
            }
            if (endDate) {
                try {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    query = query.lte('created_at', end.toISOString());
                } catch (e) {
                    return res.status(400).json({ error: 'Invalid endDate format' });
                }
            }

            // Sort and pagination
            const validSortFields = ['created_at', 'severity', 'user_id', 'resource_type'];
            const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
            const ascending = sortOrder === 'asc';

            query = query
                .order(sortField, { ascending })
                .range(parsedOffset, parsedOffset + parsedLimit - 1);

            const { data, error, count } = await query;

            if (error) {
                console.error('[AuditLogs] Query error:', error);
                return res.status(500).json({ error: 'Failed to fetch audit logs' });
            }

            res.json({
                logs: data || [],
                pagination: {
                    total: count || 0,
                    limit: parsedLimit,
                    offset: parsedOffset,
                    hasMore: parsedOffset + parsedLimit < (count || 0)
                }
            });
        } catch (err) {
            console.error('[AuditLogs] Error:', err.message);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * GET /api/audit-logs/suspicious
     * List hanya suspicious logs
     */
    app.get('/api/audit-logs/suspicious', authenticateToken, authorizeRole('moderator', 'super_admin'), async (req, res) => {
        try {
            const {
                limit = 50,
                offset = 0,
                severity
            } = req.query;

            const parsedLimit = Math.min(parseInt(limit) || 50, 500);
            const parsedOffset = parseInt(offset) || 0;

            let query = supabase
                .from('audit_logs')
                .select('*', { count: 'exact' })
                .eq('is_suspicious', true);

            if (severity) {
                query = query.eq('severity', severity);
            }

            const { data, error, count } = await query
                .order('created_at', { ascending: false })
                .range(parsedOffset, parsedOffset + parsedLimit - 1);

            if (error) {
                console.error('[AuditLogs] Suspicious query error:', error);
                return res.status(500).json({ error: 'Failed to fetch suspicious logs' });
            }

            res.json({
                logs: data || [],
                pagination: {
                    total: count || 0,
                    limit: parsedLimit,
                    offset: parsedOffset,
                    hasMore: parsedOffset + parsedLimit < (count || 0)
                }
            });
        } catch (err) {
            console.error('[AuditLogs] Suspicious error:', err.message);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * GET /api/audit-logs/stats
     * Get summary statistics
     */
    app.get('/api/audit-logs/stats', authenticateToken, authorizeRole('moderator', 'super_admin'), async (req, res) => {
        try {
            const { startDate, endDate } = req.query;

            let dateRange = '';
            if (startDate || endDate) {
                const start = startDate ? new Date(startDate).toISOString() : null;
                const end = endDate ? new Date(endDate).toISOString() : null;

                if (start && end) {
                    dateRange = ` where created_at between '${start}' and '${end}'`;
                } else if (start) {
                    dateRange = ` where created_at >= '${start}'`;
                } else if (end) {
                    dateRange = ` where created_at <= '${end}'`;
                }
            }

            // Get counts by operation type
            const operationStats = await supabase.rpc('get_audit_stats_by_operation', {
                date_range: dateRange
            }).then(res => res.data || []).catch(() => []);

            // Get counts by resource type
            const resourceStats = await supabase.rpc('get_audit_stats_by_resource', {
                date_range: dateRange
            }).then(res => res.data || []).catch(() => []);

            // Get severity distribution
            const severityStats = await supabase.rpc('get_audit_stats_by_severity', {
                date_range: dateRange
            }).then(res => res.data || []).catch(() => []);

            // Get suspicious count
            const { count: suspiciousCount } = await supabase
                .from('audit_logs')
                .select('id', { count: 'exact' })
                .eq('is_suspicious', true);

            res.json({
                operations: operationStats,
                resources: resourceStats,
                severity: severityStats,
                suspicious: suspiciousCount || 0
            });
        } catch (err) {
            console.error('[AuditLogs] Stats error:', err.message);
            res.status(500).json({ error: 'Failed to fetch audit stats' });
        }
    });

    /**
     * GET /api/audit-logs/:id
     * Get detailed log entry
     */
    app.get('/api/audit-logs/:id', authenticateToken, authorizeRole('moderator', 'super_admin'), async (req, res) => {
        try {
            const { id } = req.params;

            const { data, error } = await supabase
                .from('audit_logs')
                .select('*')
                .eq('id', id)
                .single();

            if (error || !data) {
                return res.status(404).json({ error: 'Audit log not found' });
            }

            res.json(data);
        } catch (err) {
            console.error('[AuditLogs] Get detail error:', err.message);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * GET /api/audit-logs/export/csv
     * Export audit logs as CSV
     */
    app.get('/api/audit-logs/export/csv', authenticateToken, authorizeRole('moderator', 'super_admin'), async (req, res) => {
        try {
            const {
                userId,
                resourceType,
                operation,
                startDate,
                endDate,
                severity,
                isSuspicious
            } = req.query;

            let query = supabase.from('audit_logs').select('*');

            // Apply same filters as list endpoint
            if (userId) query = query.eq('user_id', userId);
            if (resourceType) query = query.eq('resource_type', resourceType);
            if (operation) query = query.eq('operation', operation);
            if (severity) query = query.eq('severity', severity);
            if (isSuspicious === 'true') query = query.eq('is_suspicious', true);

            if (startDate) {
                const start = new Date(startDate).toISOString();
                query = query.gte('created_at', start);
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query = query.lte('created_at', end.toISOString());
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) {
                return res.status(500).json({ error: 'Failed to export audit logs' });
            }

            // Convert to CSV
            const csv = convertToCSV(data || []);

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`);
            res.send(csv);
        } catch (err) {
            console.error('[AuditLogs] Export error:', err.message);
            res.status(500).json({ error: 'Failed to export audit logs' });
        }
    });

    /**
     * POST /api/audit-logs/mark-reviewed
     * Mark suspicious logs as reviewed
     */
    app.post('/api/audit-logs/mark-reviewed', authenticateToken, authorizeRole('moderator', 'super_admin'), async (req, res) => {
        try {
            const { logIds } = req.body;

            if (!Array.isArray(logIds) || logIds.length === 0) {
                return res.status(400).json({ error: 'logIds must be a non-empty array' });
            }

            // Update is_suspicious to false (marking as reviewed)
            const { error } = await supabase
                .from('audit_logs')
                .update({ is_suspicious: false })
                .in('id', logIds);

            if (error) {
                return res.status(500).json({ error: 'Failed to mark logs as reviewed' });
            }

            res.json({ message: `Marked ${logIds.length} logs as reviewed` });
        } catch (err) {
            console.error('[AuditLogs] Mark reviewed error:', err.message);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * GET /api/audit-logs/user/:userId
     * Get all logs for a specific user
     */
    app.get('/api/audit-logs/user/:userId', authenticateToken, authorizeRole('moderator', 'super_admin'), async (req, res) => {
        try {
            const { userId } = req.params;
            const { limit = 50, offset = 0 } = req.query;

            const parsedLimit = Math.min(parseInt(limit) || 50, 500);
            const parsedOffset = parseInt(offset) || 0;

            const { data, error, count } = await supabase
                .from('audit_logs')
                .select('*', { count: 'exact' })
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .range(parsedOffset, parsedOffset + parsedLimit - 1);

            if (error) {
                return res.status(500).json({ error: 'Failed to fetch user logs' });
            }

            res.json({
                logs: data || [],
                pagination: {
                    total: count || 0,
                    limit: parsedLimit,
                    offset: parsedOffset,
                    hasMore: parsedOffset + parsedLimit < (count || 0)
                }
            });
        } catch (err) {
            console.error('[AuditLogs] User logs error:', err.message);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
};

/**
 * Convert array of objects to CSV string
 */
function convertToCSV(data) {
    if (!data || data.length === 0) {
        return 'No data';
    }

    const headers = [
        'ID',
        'User Email',
        'User Role',
        'Action',
        'Resource Type',
        'Resource Name',
        'Operation',
        'Status Code',
        'Response Message',
        'Error Message',
        'Severity',
        'Suspicious',
        'Created At',
        'IP Address'
    ];

    const rows = data.map(log => [
        log.id,
        escapeCSV(log.user_email),
        log.user_role,
        escapeCSV(log.action),
        log.resource_type,
        escapeCSV(log.resource_name),
        log.operation,
        log.status_code,
        escapeCSV(log.response_message),
        escapeCSV(log.error_message),
        log.severity,
        log.is_suspicious ? 'Yes' : 'No',
        log.created_at,
        log.ip_address
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');

    return csvContent;
}

/**
 * Escape CSV special characters
 */
function escapeCSV(value) {
    if (!value) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}
