/**
 * audit-logger-enhanced.js
 * Enhanced audit logger dengan resource-specific operations dan contextual actions
 * Support untuk berbagai resource types dengan action templates yang kaya detail
 */

class EnhancedAuditLogger {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
        this.actionTemplates = this._initializeActionTemplates();
        this.severityMatrix = this._initializeSeverityMatrix();
    }

    /**
     * Initialize action templates untuk berbagai resource types
     */
    _initializeActionTemplates() {
        return {
            invoice: {
                CREATE: {
                    template: 'Invoice baru dibuat',
                    fields: ['nomor_invoice', 'jumlah', 'toko_id', 'kategori'],
                    severity: 'info'
                },
                UPDATE: {
                    template: 'Invoice diubah',
                    fields: ['jumlah', 'status', 'kategori', 'tanggal'],
                    severity: 'warning'
                },
                DELETE: {
                    template: 'Invoice dihapus',
                    fields: ['nomor_invoice', 'jumlah'],
                    severity: 'critical'
                },
                DOWNLOAD: {
                    template: 'Invoice diunduh',
                    fields: ['nomor_invoice', 'file_format'],
                    severity: 'info'
                },
                SEND: {
                    template: 'Invoice dikirim',
                    fields: ['nomor_invoice', 'penerima_email', 'metode'],
                    severity: 'info'
                },
                APPROVE: {
                    template: 'Invoice disetujui',
                    fields: ['nomor_invoice', 'peninjau'],
                    severity: 'info'
                },
                REJECT: {
                    template: 'Invoice ditolak',
                    fields: ['nomor_invoice', 'alasan'],
                    severity: 'warning'
                },
                BULK_DELETE: {
                    template: 'Invoice dihapus secara massal',
                    fields: ['jumlah_invoice', 'filter_kriteria'],
                    severity: 'critical'
                }
            },
            file: {
                CREATE: {
                    template: 'File baru diunggah',
                    fields: ['filename', 'ukuran', 'tipe_file', 'toko_id'],
                    severity: 'info'
                },
                UPDATE: {
                    template: 'File diperbarui',
                    fields: ['filename', 'metadata'],
                    severity: 'info'
                },
                DELETE: {
                    template: 'File dihapus',
                    fields: ['filename', 'ukuran', 'toko_id'],
                    severity: 'warning'
                },
                DOWNLOAD: {
                    template: 'File diunduh',
                    fields: ['filename', 'ukuran'],
                    severity: 'info'
                },
                MOVE: {
                    template: 'File dipindahkan',
                    fields: ['filename', 'dari_toko', 'ke_toko'],
                    severity: 'warning'
                },
                RENAME: {
                    template: 'File diubah nama',
                    fields: ['nama_lama', 'nama_baru'],
                    severity: 'info'
                },
                RESTORE: {
                    template: 'File dipulihkan dari tempat sampah',
                    fields: ['filename', 'tanggal_dihapus'],
                    severity: 'info'
                },
                BULK_DELETE: {
                    template: 'File dihapus secara massal',
                    fields: ['jumlah_file', 'ukuran_total', 'toko_id'],
                    severity: 'critical'
                },
                SYNC: {
                    template: 'File disinkronkan dengan storage',
                    fields: ['jumlah_file', 'storage_type'],
                    severity: 'info'
                }
            },
            user: {
                CREATE: {
                    template: 'User baru dibuat',
                    fields: ['email', 'role', 'zona_id'],
                    severity: 'info'
                },
                UPDATE: {
                    template: 'Profil user diubah',
                    fields: ['email', 'role', 'status'],
                    severity: 'warning'
                },
                DELETE: {
                    template: 'User dihapus',
                    fields: ['email', 'role'],
                    severity: 'critical'
                },
                LOGIN: {
                    template: 'User login',
                    fields: ['email', 'metode_login'],
                    severity: 'info'
                },
                LOGOUT: {
                    template: 'User logout',
                    fields: ['email', 'durasi_session'],
                    severity: 'info'
                },
                PASSWORD_CHANGE: {
                    template: 'Password user diubah',
                    fields: ['email'],
                    severity: 'warning'
                },
                ROLE_CHANGE: {
                    template: 'Role user diubah',
                    fields: ['email', 'role_lama', 'role_baru'],
                    severity: 'critical'
                },
                UNLOCK: {
                    template: 'User tidak lagi terkunci',
                    fields: ['email', 'alasan'],
                    severity: 'info'
                },
                LOCK: {
                    template: 'User dikunci',
                    fields: ['email', 'alasan'],
                    severity: 'warning'
                }
            },
            zona: {
                CREATE: {
                    template: 'Zona baru dibuat',
                    fields: ['zona_nama', 'zona_deskripsi'],
                    severity: 'info'
                },
                UPDATE: {
                    template: 'Zona diperbarui',
                    fields: ['zona_nama', 'pengaturan'],
                    severity: 'warning'
                },
                DELETE: {
                    template: 'Zona dihapus',
                    fields: ['zona_nama', 'jumlah_toko'],
                    severity: 'critical'
                },
                ADMIN_ASSIGN: {
                    template: 'Admin zona ditugaskan',
                    fields: ['zona_nama', 'admin_email'],
                    severity: 'info'
                },
                ADMIN_REMOVE: {
                    template: 'Admin zona dihapus',
                    fields: ['zona_nama', 'admin_email'],
                    severity: 'warning'
                },
                SYNC: {
                    template: 'Data zona disinkronkan',
                    fields: ['zona_nama', 'jumlah_record'],
                    severity: 'info'
                }
            },
            toko: {
                CREATE: {
                    template: 'Toko baru ditambahkan',
                    fields: ['nama_toko', 'zona_id', 'alamat'],
                    severity: 'info'
                },
                UPDATE: {
                    template: 'Data toko diubah',
                    fields: ['nama_toko', 'field_yang_diubah'],
                    severity: 'info'
                },
                DELETE: {
                    template: 'Toko dihapus',
                    fields: ['nama_toko', 'zona_id', 'jumlah_file'],
                    severity: 'warning'
                },
                MERGE: {
                    template: 'Toko digabung (duplikat)',
                    fields: ['toko_sumber', 'toko_tujuan', 'jumlah_file_dipindahkan'],
                    severity: 'warning'
                },
                BULK_DELETE: {
                    template: 'Toko dihapus secara massal',
                    fields: ['jumlah_toko', 'zona_id'],
                    severity: 'critical'
                }
            },
            ticket: {
                CREATE: {
                    template: 'Support ticket baru dibuat',
                    fields: ['ticket_id', 'kategori', 'prioritas'],
                    severity: 'info'
                },
                UPDATE: {
                    template: 'Ticket diperbarui',
                    fields: ['ticket_id', 'status', 'catatan_terakhir'],
                    severity: 'info'
                },
                CLOSE: {
                    template: 'Ticket ditutup',
                    fields: ['ticket_id', 'solusi_final'],
                    severity: 'info'
                },
                ASSIGN: {
                    template: 'Ticket ditugaskan',
                    fields: ['ticket_id', 'penanggungjawab'],
                    severity: 'info'
                },
                REOPEN: {
                    template: 'Ticket dibuka kembali',
                    fields: ['ticket_id', 'alasan'],
                    severity: 'warning'
                }
            },
            system: {
                CONFIG_CHANGE: {
                    template: 'Konfigurasi sistem diubah',
                    fields: ['config_key', 'nilai_lama', 'nilai_baru'],
                    severity: 'critical'
                },
                BACKUP_CREATE: {
                    template: 'Database backup dibuat',
                    fields: ['backup_size', 'tipe_backup'],
                    severity: 'info'
                },
                BACKUP_RESTORE: {
                    template: 'Database di-restore dari backup',
                    fields: ['backup_tanggal', 'waktu_restore'],
                    severity: 'critical'
                },
                MAINTENANCE: {
                    template: 'Mode maintenance aktif',
                    fields: ['alasan', 'durasi_perkiraan'],
                    severity: 'warning'
                },
                API_KEY_GENERATE: {
                    template: 'API key baru dibuat',
                    fields: ['service_name'],
                    severity: 'warning'
                },
                API_KEY_REVOKE: {
                    template: 'API key di-revoke',
                    fields: ['service_name'],
                    severity: 'warning'
                }
            },
            report: {
                CREATE: {
                    template: 'Laporan dibuat',
                    fields: ['tipe_laporan', 'periode', 'jumlah_record'],
                    severity: 'info'
                },
                EXPORT: {
                    template: 'Laporan diekspor',
                    fields: ['tipe_laporan', 'format_export', 'ukuran_file'],
                    severity: 'info'
                },
                SCHEDULE: {
                    template: 'Laporan dijadwalkan',
                    fields: ['tipe_laporan', 'frekuensi', 'penerima'],
                    severity: 'info'
                }
            }
        };
    }

    /**
     * Initialize severity matrix based on resource type and operation
     */
    _initializeSeverityMatrix() {
        return {
            invoice: {
                CREATE: 'info',
                UPDATE: 'warning',
                DELETE: 'critical',
                DOWNLOAD: 'info',
                SEND: 'info',
                APPROVE: 'info',
                REJECT: 'warning',
                BULK_DELETE: 'critical'
            },
            file: {
                CREATE: 'info',
                UPDATE: 'info',
                DELETE: 'warning',
                DOWNLOAD: 'info',
                MOVE: 'warning',
                RENAME: 'info',
                RESTORE: 'info',
                BULK_DELETE: 'critical',
                SYNC: 'info'
            },
            user: {
                CREATE: 'info',
                UPDATE: 'warning',
                DELETE: 'critical',
                LOGIN: 'info',
                LOGOUT: 'info',
                PASSWORD_CHANGE: 'warning',
                ROLE_CHANGE: 'critical',
                UNLOCK: 'info',
                LOCK: 'warning'
            },
            zona: {
                CREATE: 'info',
                UPDATE: 'warning',
                DELETE: 'critical',
                ADMIN_ASSIGN: 'info',
                ADMIN_REMOVE: 'warning',
                SYNC: 'info'
            },
            toko: {
                CREATE: 'info',
                UPDATE: 'info',
                DELETE: 'warning',
                MERGE: 'warning',
                BULK_DELETE: 'critical'
            },
            ticket: {
                CREATE: 'info',
                UPDATE: 'info',
                CLOSE: 'info',
                ASSIGN: 'info',
                REOPEN: 'warning'
            },
            system: {
                CONFIG_CHANGE: 'critical',
                BACKUP_CREATE: 'info',
                BACKUP_RESTORE: 'critical',
                MAINTENANCE: 'warning',
                API_KEY_GENERATE: 'warning',
                API_KEY_REVOKE: 'warning'
            },
            report: {
                CREATE: 'info',
                EXPORT: 'info',
                SCHEDULE: 'info'
            }
        };
    }

    /**
     * Log dengan context yang kaya
     */
    async logWithContext({
        userId,
        userEmail,
        userRole,
        zonaId,
        resourceType,
        resourceId,
        resourceName,
        operation,
        context = {}, // Additional context data
        oldValues = null,
        newValues = null,
        ipAddress,
        userAgent,
        requestPath,
        requestMethod,
        statusCode,
        isSuspicious = false
    }) {
        try {
            // Get action template
            const template = this.actionTemplates[resourceType]?.[operation];
            if (!template) {
                console.warn(`[AuditLogger] No template for ${resourceType}.${operation}`);
                return this._logFallback({
                    userId, userEmail, userRole, zonaId, resourceType, resourceId, resourceName,
                    operation, oldValues, newValues, ipAddress, userAgent, requestPath,
                    requestMethod, statusCode, isSuspicious
                });
            }

            // Build action description with context
            const action = this._buildActionDescription(template, context);

            // Determine severity
            const severity = this.severityMatrix[resourceType]?.[operation] || 'info';

            // Detect suspicious activity
            const detectSuspicious = isSuspicious || this._detectSuspiciousPattern({
                operation,
                resourceType,
                statusCode,
                context
            });

            // Extract relevant fields for new_values
            const enrichedNewValues = this._enrichValues(newValues, template.fields);

            // Log to database
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
                    new_values: enrichedNewValues,
                    ip_address: ipAddress ? this._sanitizeIp(ipAddress) : null,
                    user_agent: userAgent ? userAgent.substring(0, 255) : null,
                    request_path: requestPath,
                    request_method: requestMethod,
                    status_code: statusCode,
                    response_message: context.responseMessage || null,
                    error_message: context.errorMessage || null,
                    is_suspicious: detectSuspicious,
                    severity: detectSuspicious ? 'critical' : severity
                })
                .select('id, created_at')
                .single();

            if (error) {
                console.error('[AuditLogger] Failed to insert log:', error.message);
                return null;
            }

            // Alert if suspicious
            if (detectSuspicious) {
                console.warn('[SUSPICIOUS ACTIVITY DETECTED]', {
                    userId,
                    action,
                    resourceType,
                    operation,
                    context
                });
            }

            return data;
        } catch (err) {
            console.error('[AuditLogger] Error:', err.message);
            return null;
        }
    }

    /**
     * Build action description from template and context
     */
    _buildActionDescription(template, context) {
        let description = template.template;

        // Add context-specific details if available
        if (context.detail) {
            description += ` - ${context.detail}`;
        }

        if (context.reason) {
            description += ` (Alasan: ${context.reason})`;
        }

        return description;
    }

    /**
     * Enrich values dengan hanya field yang relevan
     */
    _enrichValues(values, relevantFields) {
        if (!values || !Array.isArray(relevantFields)) return values;

        const enriched = {};
        relevantFields.forEach(field => {
            if (values.hasOwnProperty(field)) {
                enriched[field] = values[field];
            }
        });

        return Object.keys(enriched).length > 0 ? enriched : values;
    }

    /**
     * Fallback ke audit logger standar
     */
    async _logFallback({
        userId, userEmail, userRole, zonaId, resourceType, resourceId, resourceName,
        operation, oldValues, newValues, ipAddress, userAgent, requestPath,
        requestMethod, statusCode, isSuspicious
    }) {
        try {
            const action = `${operation} ${resourceType}${resourceName ? ': ' + resourceName : ''}`;

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
                    ip_address: ipAddress ? this._sanitizeIp(ipAddress) : null,
                    user_agent: userAgent ? userAgent.substring(0, 255) : null,
                    request_path: requestPath,
                    request_method: requestMethod,
                    status_code: statusCode,
                    is_suspicious: isSuspicious,
                    severity: 'info'
                })
                .select('id')
                .single();

            return error ? null : data;
        } catch (err) {
            console.error('[AuditLogger] Fallback error:', err.message);
            return null;
        }
    }

    /**
     * Detect suspicious patterns
     */
    _detectSuspiciousPattern({ operation, resourceType, statusCode, context }) {
        // HTTP error
        if (statusCode >= 400 && statusCode !== 404) {
            return true;
        }

        // Bulk operations
        if (operation === 'BULK_DELETE') {
            return true;
        }

        // High volume context
        if (context.jumlah_file && context.jumlah_file > 100) {
            return true;
        }

        if (context.jumlah_invoice && context.jumlah_invoice > 50) {
            return true;
        }

        // Role changes
        if (operation === 'ROLE_CHANGE' && resourceType === 'user') {
            return true;
        }

        return false;
    }

    /**
     * Sanitize IP address
     */
    _sanitizeIp(ip) {
        return ip.split(':')[0];
    }

    /**
     * Static helper untuk extract client info
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
     * Static helper untuk extract user info
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

module.exports = EnhancedAuditLogger;
