/**
 * Backup API Endpoints
 * 
 * GET  /api/backups/history         - Get backup history
 * GET  /api/backups/config          - Get backup configuration
 * POST /api/backups/manual          - Trigger manual backup
 * POST /api/backups/restore         - Restore from backup
 * DELETE /api/backups/:backupId     - Delete a backup
 */

const express = require('express');
const router = express.Router();

module.exports = (supabaseClient, backupManager, authenticateToken, authorizeRole) => {
    /**
     * GET /api/backups/history
     * Get backup history with optional filtering
     */
    router.get('/backups/history', authenticateToken, async (req, res) => {
        try {
            const { type, limit = 50, offset = 0 } = req.query;

            const history = await backupManager.getBackupHistory(type, limit);

            return res.json({
                success: true,
                data: history,
                total: history.length
            });
        } catch (error) {
            console.error('[BackupAPI] Get history error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to get backup history'
            });
        }
    });

    /**
     * GET /api/backups/stats
     * Get backup statistics and status
     */
    router.get('/backups/stats', authenticateToken, async (req, res) => {
        try {
            const history = await backupManager.getBackupHistory(null, 100);

            // Calculate stats
            const stats = {
                total: history.length,
                byType: {},
                byStatus: {},
                lastBackups: {}
            };

            history.forEach(backup => {
                // Count by type
                stats.byType[backup.type] = (stats.byType[backup.type] || 0) + 1;
                
                // Count by status
                stats.byStatus[backup.status] = (stats.byStatus[backup.status] || 0) + 1;

                // Get latest by type
                if (!stats.lastBackups[backup.type]) {
                    stats.lastBackups[backup.type] = backup;
                }
            });

            return res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('[BackupAPI] Get stats error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to get backup stats'
            });
        }
    });

    /**
     * GET /api/backups/config
     * Get backup configuration
     */
    router.get('/backups/config', authenticateToken, async (req, res) => {
        try {
            const { data, error } = await supabaseClient
                .from('backup_config')
                .select('*');

            if (error) throw error;

            return res.json({
                success: true,
                data
            });
        } catch (error) {
            console.error('[BackupAPI] Get config error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to get backup config'
            });
        }
    });

    /**
     * POST /api/backups/manual
     * Manually trigger a backup
     * 
     * Request body:
     * {
     *   "type": "database|files|config"  // optional, if empty do all
     * }
     */
    router.post('/backups/manual', authenticateToken, async (req, res) => {
        try {
            const { type } = req.body;
            const results = {};

            // Trigger backup(s)
            if (!type || type === 'database') {
                results.database = await backupManager.performDatabaseBackup();
            }
            if (!type || type === 'files') {
                results.files = await backupManager.performFileBackup();
            }
            if (!type || type === 'config') {
                results.config = await backupManager.performConfigBackup();
            }

            // Check if any failed
            const failed = Object.values(results).some(r => !r.success);

            return res.json({
                success: !failed,
                results,
                message: failed ? 'Some backups failed' : 'Backup(s) completed successfully'
            });
        } catch (error) {
            console.error('[BackupAPI] Manual backup error:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /api/backups/restore
     * Restore from a backup
     * 
     * Request body:
     * {
     *   "backupName": "db-backup-2024-01-15T00-00-00-000Z.sql",
     *   "type": "database|files|config"
     * }
     */
    router.post('/backups/restore', authenticateToken, async (req, res) => {
        try {
            const { backupName, type } = req.body;

            if (!backupName || !type) {
                return res.status(400).json({
                    success: false,
                    error: 'backupName and type are required'
                });
            }

            // Log restoration attempt
            console.log(`[BackupAPI] Restoration initiated by ${req.user?.email} for ${type}: ${backupName}`);

            const result = await backupManager.restoreBackup(backupName, type);

            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    error: result.error
                });
            }

            // Log successful restoration
            console.log(`[BackupAPI] Restoration completed for ${type}: ${backupName}`);

            return res.json({
                success: true,
                message: `${type} backup restored successfully`,
                result
            });
        } catch (error) {
            console.error('[BackupAPI] Restore error:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * DELETE /api/backups/:backupName
     * Delete a backup from R2
     */
    router.delete('/backups/:backupName', authenticateToken, async (req, res) => {
        try {
            const { backupName } = req.params;
            const { type } = req.query;

            if (!type) {
                return res.status(400).json({
                    success: false,
                    error: 'type query parameter is required'
                });
            }

            // Delete from R2
            await backupManager.r2.deleteFile(`backups/${type}/${backupName}`);

            // Remove from history (optional - keep for audit trail)
            // await supabaseClient
            //     .from('backup_history')
            //     .delete()
            //     .eq('name', backupName);

            console.log(`[BackupAPI] Backup deleted: ${type}/${backupName}`);

            return res.json({
                success: true,
                message: 'Backup deleted successfully'
            });
        } catch (error) {
            console.error('[BackupAPI] Delete error:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/backups/download/:backupName
     * Download a backup file
     */
    router.get('/backups/download/:backupName', authenticateToken, async (req, res) => {
        try {
            const { backupName } = req.params;
            const { type } = req.query;

            if (!type) {
                return res.status(400).json({
                    success: false,
                    error: 'type query parameter is required'
                });
            }

            const content = await backupManager.r2.downloadFile(`backups/${type}/${backupName}`);

            res.setHeader('Content-Disposition', `attachment; filename="${backupName}"`);
            res.setHeader('Content-Type', 
                type === 'database' ? 'application/sql' :
                type === 'files' ? 'application/zip' :
                'application/json'
            );

            return res.send(content);
        } catch (error) {
            console.error('[BackupAPI] Download error:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /api/backups/cleanup
     * Cleanup old backups based on retention policy
     */
    router.post('/backups/cleanup', authenticateToken, async (req, res) => {
        try {
            console.log('[BackupAPI] Starting backup cleanup...');

            const configs = await supabaseClient
                .from('backup_config')
                .select('*');

            let deletedCount = 0;

            for (const config of configs.data || []) {
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - config.retention_days);

                const history = await backupManager.getBackupHistory(config.backup_type, 1000);
                
                for (const backup of history) {
                    if (new Date(backup.timestamp) < cutoffDate) {
                        try {
                            await backupManager.r2.deleteFile(backup.path);
                            deletedCount++;
                        } catch (error) {
                            console.warn(`[BackupAPI] Failed to delete ${backup.path}:`, error.message);
                        }
                    }
                }
            }

            console.log(`[BackupAPI] Cleanup completed: ${deletedCount} backups deleted`);

            return res.json({
                success: true,
                deleted: deletedCount,
                message: `Deleted ${deletedCount} old backups`
            });
        } catch (error) {
            console.error('[BackupAPI] Cleanup error:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    return router;
};
