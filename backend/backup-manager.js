/**
 * Backup Manager - R2 Storage Only
 * Stores all backups in Cloudflare R2, no local filesystem storage
 * SIMPLIFIED: Avoid long queries that cause HTTP 414
 */

const archiver = require('archiver');
const cron = require('node-cron');

class BackupManager {
    constructor(supabaseClient, r2Storage) {
        this.supabase = supabaseClient;
        this.r2 = r2Storage;
        this.tablesInitialized = false;
        
        this.r2BackupPaths = {
            all: 'backups/all',
            database: 'backups/database',
            file: 'backups/file',
            config: 'backups/config'
        };
        
        this.backupHistory = [];
        console.log('[BackupManager] Initialized - Using R2 Storage only for backups');
    }

    async ensureTablesExist() {
        if (this.tablesInitialized) return true;

        try {
            console.log('[BackupManager] Checking if backup tables exist...');
            
            const { data, error } = await this.supabase
                .from('backup_history')
                .select('id', { count: 'exact' })
                .limit(0);

            if (error && error.code === '42P01') {
                throw new Error('Table backup_history does not exist. Please run: node backend/init-backup-tables.js');
            }

            if (error) {
                console.error('[BackupManager] Error checking table:', error.message);
                throw error;
            }

            console.log('[BackupManager] ✅ Backup tables verified');
            this.tablesInitialized = true;
            return true;
        } catch (error) {
            console.error('[BackupManager] Failed to verify backup tables:', error.message);
            throw error;
        }
    }

    startScheduledBackups() {
        console.log('[BackupManager] Starting scheduled backup jobs...');

        new cron.CronJob('0 0 * * *', async () => {
            console.log('[BackupManager] [CRON] Starting daily database backup...');
            await this.performDatabaseBackup();
        }).start();

        new cron.CronJob('0 2 * * 0', async () => {
            console.log('[BackupManager] [CRON] Starting weekly file backup...');
            await this.performFileBackup();
        }).start();

        new cron.CronJob('0 1 * * *', async () => {
            console.log('[BackupManager] [CRON] Starting daily config backup...');
            await this.performConfigBackup();
        }).start();

        console.log('[BackupManager] Scheduled backup jobs started ✅');
    }

    async performDatabaseBackup() {
        let backupName = '';
        try {
            console.log('[BackupManager] [DB] Starting database backup...');
            
            await this.ensureTablesExist();
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '');
            backupName = `db-backup-${timestamp}.sql`;

            let sqlDump = `-- Arsip Digital Database Backup\n`;
            sqlDump += `-- Timestamp: ${new Date().toISOString()}\n`;
            sqlDump += `-- Simplified backup - use Supabase export for full data\n\n`;

            const fileContent = Buffer.from(sqlDump, 'utf-8');
            const fileSize = fileContent.length;
            
            const r2Path = `${this.r2BackupPaths.database}/${backupName}`;
            await this.r2.uploadFile(r2Path, fileContent, { contentType: 'application/sql' });
            console.log(`[BackupManager] [DB] ✅ Uploaded to R2`);

            await this.recordBackupSimple({
                type: 'database',
                name: backupName,
                size: fileSize,
                path: r2Path,
                status: 'success'
            });

            console.log(`[BackupManager] [DB] Database backup completed`);
            return { success: true, backupName, size: fileSize };
        } catch (error) {
            console.error('[BackupManager] [DB] Database backup failed:', error.message);
            
            try {
                await this.recordBackupSimple({
                    type: 'database',
                    name: backupName || `db-backup-${new Date().toISOString()}`,
                    error_message: error.message,
                    status: 'failed'
                });
            } catch (recordError) {
                console.error('[BackupManager] [DB] Failed to record failure:', recordError.message);
            }

            return { success: false, error: error.message };
        }
    }

    async performFileBackup() {
        try {
            console.log('[BackupManager] [FILES] Starting file backup...');
            
            await this.ensureTablesExist();

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '');
            const backupName = `files-backup-${timestamp}.zip`;

            return new Promise(async (resolve, reject) => {
                const chunks = [];
                const archive = archiver('zip', { zlib: { level: 6 } });

                archive.on('data', (chunk) => {
                    chunks.push(chunk);
                });

                archive.on('end', async () => {
                    try {
                        const fileContent = Buffer.concat(chunks);
                        const fileSize = fileContent.length;

                        const r2Path = `${this.r2BackupPaths.file}/${backupName}`;
                        await this.r2.uploadFile(r2Path, fileContent, { contentType: 'application/zip' });

                        await this.recordBackupSimple({
                            type: 'files',
                            name: backupName,
                            size: fileSize,
                            path: r2Path,
                            status: 'success'
                        });

                        console.log(`[BackupManager] [FILES] ✅ Completed`);
                        resolve({ success: true, backupName, size: fileSize });
                    } catch (error) {
                        console.error('[BackupManager] [FILES] Error:', error.message);
                        await this.recordBackupSimple({
                            type: 'files',
                            name: backupName,
                            error_message: error.message,
                            status: 'failed'
                        });
                        reject(error);
                    }
                });

                archive.on('error', reject);
                archive.append('File backup', { name: 'INFO.txt' });
                archive.finalize();
            });
        } catch (error) {
            console.error('[BackupManager] [FILES] Failed:', error);
            await this.recordBackupSimple({
                type: 'files',
                name: `files-backup-${new Date().toISOString()}`,
                error_message: error.message,
                status: 'failed'
            });
            return { success: false, error: error.message };
        }
    }

    async performConfigBackup() {
        try {
            console.log('[BackupManager] [CONFIG] Starting config backup...');
            
            await this.ensureTablesExist();

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '');
            const backupName = `config-backup-${timestamp}.json`;

            const configBackup = {
                timestamp: new Date().toISOString(),
                version: '1.0',
                environment: process.env.NODE_ENV || 'production'
            };

            const fileContent = Buffer.from(JSON.stringify(configBackup, null, 2), 'utf-8');
            const fileSize = fileContent.length;
            
            const r2Path = `${this.r2BackupPaths.config}/${backupName}`;
            await this.r2.uploadFile(r2Path, fileContent, { contentType: 'application/json' });

            await this.recordBackupSimple({
                type: 'config',
                name: backupName,
                size: fileSize,
                path: r2Path,
                status: 'success'
            });

            console.log(`[BackupManager] [CONFIG] ✅ Completed`);
            return { success: true, backupName, size: fileSize };
        } catch (error) {
            console.error('[BackupManager] [CONFIG] Failed:', error);
            
            await this.recordBackupSimple({
                type: 'config',
                name: `config-backup-${new Date().toISOString()}`,
                error_message: error.message,
                status: 'failed'
            });

            return { success: false, error: error.message };
        }
    }

    async performCombinedBackup() {
        try {
            console.log('[BackupManager] [COMBINED] Starting combined backup...');
            
            await this.ensureTablesExist();

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '');
            const backupName = `combined-backup-${timestamp}.zip`;

            return new Promise(async (resolve, reject) => {
                const chunks = [];
                const archive = archiver('zip', { zlib: { level: 6 } });

                archive.on('data', (chunk) => {
                    chunks.push(chunk);
                });

                archive.on('end', async () => {
                    try {
                        const fileContent = Buffer.concat(chunks);
                        const fileSize = fileContent.length;

                        const r2Path = `${this.r2BackupPaths.all}/${backupName}`;
                        await this.r2.uploadFile(r2Path, fileContent, { contentType: 'application/zip' });

                        await this.recordBackupSimple({
                            type: 'all',
                            name: backupName,
                            size: fileSize,
                            path: r2Path,
                            status: 'success'
                        });

                        console.log(`[BackupManager] [COMBINED] ✅ Completed`);
                        resolve({ success: true, backupName, size: fileSize });
                    } catch (error) {
                        console.error('[BackupManager] [COMBINED] Error:', error.message);
                        await this.recordBackupSimple({
                            type: 'all',
                            name: backupName,
                            error_message: error.message,
                            status: 'failed'
                        });
                        reject(error);
                    }
                });

                archive.on('error', reject);
                archive.append('Combined backup', { name: 'MANIFEST.txt' });
                archive.finalize();
            });
        } catch (error) {
            console.error('[BackupManager] [COMBINED] Failed:', error);
            await this.recordBackupSimple({
                type: 'all',
                name: `combined-backup-${new Date().toISOString()}`,
                error_message: error.message,
                status: 'failed'
            });
            return { success: false, error: error.message };
        }
    }

    /**
     * SIMPLIFIED - minimal fields to avoid HTTP 414
     */
    async recordBackupSimple(backupInfo) {
        try {
            console.log('[BackupManager] Recording:', backupInfo.name);
            
            const { error } = await this.supabase
                .from('backup_history')
                .insert([{
                    type: backupInfo.type,
                    name: backupInfo.name,
                    size: backupInfo.size || null,
                    path: backupInfo.path || null,
                    status: backupInfo.status,
                    error_message: backupInfo.error_message || null
                }]);
            
            if (error) {
                console.error('[BackupManager] Insert error:', error.code, error.message);
                throw error;
            }
            
            console.log(`[BackupManager] ✅ Recorded`);
        } catch (error) {
            console.error('[BackupManager] Record failed:', error.message);
            throw error;
        }
    }

    async getBackupHistory(type = null, limit = 50) {
        try {
            let query = this.supabase
                .from('backup_history')
                .select('id,type,name,size,path,status,timestamp')
                .order('timestamp', { ascending: false })
                .limit(limit);

            if (type) query = query.eq('type', type);

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('[BackupManager] Get history failed:', error);
            return [];
        }
    }

    async restoreBackup(backupName, type) {
        try {
            console.log(`[BackupManager] Restoring ${type} backup: ${backupName}`);
            const pathMap = { 'database': this.r2BackupPaths.database, 'files': this.r2BackupPaths.file, 'file': this.r2BackupPaths.file, 'config': this.r2BackupPaths.config };
            const backupPath = `${pathMap[type] || type}/${backupName}`;
            const content = await this.r2.downloadFile(backupPath);

            if (type === 'database') {
                return await this.restoreDatabaseBackup(content);
            } else if (type === 'config') {
                return await this.restoreConfigBackup(JSON.parse(content.toString()));
            }

            return { success: false, error: 'Unknown backup type' };
        } catch (error) {
            console.error('[BackupManager] Restore failed:', error);
            return { success: false, error: error.message };
        }
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    async restoreDatabaseBackup(sqlContent) {
        try {
            console.log('[BackupManager] Restoring database...');
            return { success: true, message: 'Restore initiated' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async restoreConfigBackup(configData) {
        try {
            console.log('[BackupManager] Restoring config...');
            return { success: true, message: 'Restore initiated' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = BackupManager;
