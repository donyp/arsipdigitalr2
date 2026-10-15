/**
 * Backup Manager - Automated backup system untuk Arsip Digital
 * 
 * Melakukan:
 * 1. Database backup harian (00:00 UTC)
 * 2. File backup mingguan (Minggu 02:00 UTC)
 * 3. Config/Metadata backup harian (01:00 UTC)
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { createClient } = require('@supabase/supabase-js');
const CronJob = require('cron').CronJob;

class BackupManager {
    constructor(supabaseClient, r2Storage) {
        this.supabase = supabaseClient;
        this.r2 = r2Storage;
        this.backupDir = path.join(__dirname, '..', 'data', 'backups');
        this.backupHistory = [];
        this.backupBucket = 'arsip-backups'; // Separate bucket for backups
        
        // Ensure backup directory exists
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }
    }

    /**
     * Start all scheduled backup jobs
     */
    startScheduledBackups() {
        console.log('[BackupManager] Starting scheduled backup jobs...');

        // Database backup: Every day at 00:00 UTC
        new CronJob('0 0 * * *', async () => {
            console.log('[BackupManager] [CRON] Starting daily database backup...');
            await this.performDatabaseBackup();
        }).start();

        // File backup: Every Sunday at 02:00 UTC
        new CronJob('0 2 * * 0', async () => {
            console.log('[BackupManager] [CRON] Starting weekly file backup...');
            await this.performFileBackup();
        }).start();

        // Config/Metadata backup: Every day at 01:00 UTC
        new CronJob('0 1 * * *', async () => {
            console.log('[BackupManager] [CRON] Starting daily config backup...');
            await this.performConfigBackup();
        }).start();

        console.log('[BackupManager] Scheduled backup jobs started successfully');
    }

    /**
     * Database Backup - Export semua tabel ke SQL dump
     */
    async performDatabaseBackup() {
        try {
            console.log('[BackupManager] [DB] Exporting database...');
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `db-backup-${timestamp}.sql`;
            const localPath = path.join(this.backupDir, backupName);

            // Get all tables - use RPC call to get list of tables
            const { data: tablesResult, error: tableError } = await this.supabase.rpc('get_all_tables');
            
            let tables = [];
            if (tableError) {
                console.warn('[BackupManager] [DB] Could not get tables via RPC, using fallback...');
                // Fallback: try to query known core tables
                tables = [
                    { table_name: 'users' },
                    { table_name: 'tokos' },
                    { table_name: 'zonas' },
                    { table_name: 'invoices' },
                    { table_name: 'files' },
                    { table_name: 'backup_history' },
                    { table_name: 'backup_config' },
                    { table_name: 'audit_logs' }
                ];
            } else {
                tables = tablesResult || [];
            }

            let sqlDump = `-- Arsip Digital Database Backup\n`;
            sqlDump += `-- Timestamp: ${new Date().toISOString()}\n`;
            sqlDump += `-- Tables: ${tables?.length || 0}\n\n`;

            // Export each table
            for (const table of tables || []) {
                const tableName = table.table_name;
                
                try {
                    const { data, error } = await this.supabase
                        .from(tableName)
                        .select('*');

                    if (error) {
                        console.warn(`[BackupManager] [DB] Skipped table ${tableName}:`, error.message);
                        continue;
                    }

                    // Generate INSERT statements
                    sqlDump += `\n-- Table: ${tableName}\n`;
                    sqlDump += `DELETE FROM ${tableName};\n`;
                    
                    if (data && data.length > 0) {
                        const columns = Object.keys(data[0]);
                        sqlDump += `INSERT INTO ${tableName} (${columns.join(',')}) VALUES\n`;
                    
                    if (data && data.length > 0) {
                        const columns = Object.keys(data[0]);
                        sqlDump += `INSERT INTO ${tableName} (${columns.join(',')}) VALUES\n`;
                        
                        sqlDump += data.map(row => {
                            const values = columns.map(col => {
                                const val = row[col];
                                if (val === null) return 'NULL';
                                if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
                                if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
                                return val;
                            }).join(',');
                            return `(${values})`;
                        }).join(',\n');
                        
                        sqlDump += ';\n';
                    }
                } catch (tableError) {
                    console.warn(`[BackupManager] [DB] Error exporting table ${tableName}:`, tableError.message);
                    continue;
                }
            }

            // Save locally
            fs.writeFileSync(localPath, sqlDump);
            const fileSize = fs.statSync(localPath).size;

            // Upload to R2
            const fileContent = fs.readFileSync(localPath);
            await this.r2.uploadFile(
                `backups/database/${backupName}`,
                fileContent,
                'application/sql'
            );

            // Record backup
            await this.recordBackup({
                type: 'database',
                name: backupName,
                size: fileSize,
                path: `backups/database/${backupName}`,
                timestamp: new Date().toISOString(),
                status: 'success'
            });

            // Cleanup local file
            fs.unlinkSync(localPath);

            console.log(`[BackupManager] [DB] Database backup completed: ${backupName} (${this.formatBytes(fileSize)})`);

            return { success: true, backupName, size: fileSize };
        } catch (error) {
            console.error('[BackupManager] [DB] Database backup failed:', error);
            
            await this.recordBackup({
                type: 'database',
                name: `db-backup-${new Date().toISOString()}`,
                error: error.message,
                timestamp: new Date().toISOString(),
                status: 'failed'
            });

            return { success: false, error: error.message };
        }
    }

    /**
     * File Backup - Archive semua files dari R2
     */
    async performFileBackup() {
        try {
            console.log('[BackupManager] [FILES] Starting file backup...');

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `files-backup-${timestamp}.zip`;
            const localPath = path.join(this.backupDir, backupName);

            // Create zip archive
            return new Promise(async (resolve, reject) => {
                const output = fs.createWriteStream(localPath);
                const archive = archiver('zip', { zlib: { level: 6 } });

                output.on('close', async () => {
                    try {
                        const fileSize = fs.statSync(localPath).size;

                        // Upload to R2
                        const fileContent = fs.readFileSync(localPath);
                        await this.r2.uploadFile(
                            `backups/files/${backupName}`,
                            fileContent,
                            'application/zip'
                        );

                        // Record backup
                        await this.recordBackup({
                            type: 'files',
                            name: backupName,
                            size: fileSize,
                            path: `backups/files/${backupName}`,
                            timestamp: new Date().toISOString(),
                            status: 'success'
                        });

                        // Cleanup
                        fs.unlinkSync(localPath);

                        console.log(`[BackupManager] [FILES] File backup completed: ${backupName} (${this.formatBytes(fileSize)})`);
                        resolve({ success: true, backupName, size: fileSize });
                    } catch (error) {
                        reject(error);
                    }
                });

                archive.on('error', reject);
                archive.pipe(output);

                // Get files from R2 and add to archive
                try {
                    const files = await this.r2.listFiles('invoices/');
                    for (const file of files) {
                        const content = await this.r2.downloadFile(file.key);
                        archive.append(content, { name: file.key });
                    }
                    archive.finalize();
                } catch (error) {
                    reject(error);
                }
            });
        } catch (error) {
            console.error('[BackupManager] [FILES] File backup failed:', error);
            
            await this.recordBackup({
                type: 'files',
                name: `files-backup-${new Date().toISOString()}`,
                error: error.message,
                timestamp: new Date().toISOString(),
                status: 'failed'
            });

            return { success: false, error: error.message };
        }
    }

    /**
     * Config/Metadata Backup - Backup configuration dan metadata
     */
    async performConfigBackup() {
        try {
            console.log('[BackupManager] [CONFIG] Starting config backup...');

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `config-backup-${timestamp}.json`;
            const localPath = path.join(this.backupDir, backupName);

            // Collect config data
            const configBackup = {
                timestamp: new Date().toISOString(),
                version: '1.0',
                config: {
                    // Sync status
                    syncStatus: this.readJsonFile(path.join(__dirname, '..', 'data', 'storage-sync-status.json')),
                    // Sync queue (metadata only, not actual files)
                    syncQueueCount: this.getQueueCount(),
                    // Environment info
                    environment: process.env.NODE_ENV,
                    // Log files (last 100 lines)
                    recentLogs: this.getRecentLogs(100)
                }
            };

            // Save locally
            fs.writeFileSync(localPath, JSON.stringify(configBackup, null, 2));
            const fileSize = fs.statSync(localPath).size;

            // Upload to R2
            const fileContent = fs.readFileSync(localPath);
            await this.r2.uploadFile(
                `backups/config/${backupName}`,
                fileContent,
                'application/json'
            );

            // Record backup
            await this.recordBackup({
                type: 'config',
                name: backupName,
                size: fileSize,
                path: `backups/config/${backupName}`,
                timestamp: new Date().toISOString(),
                status: 'success'
            });

            // Cleanup
            fs.unlinkSync(localPath);

            console.log(`[BackupManager] [CONFIG] Config backup completed: ${backupName} (${this.formatBytes(fileSize)})`);

            return { success: true, backupName, size: fileSize };
        } catch (error) {
            console.error('[BackupManager] [CONFIG] Config backup failed:', error);
            
            await this.recordBackup({
                type: 'config',
                name: `config-backup-${new Date().toISOString()}`,
                error: error.message,
                timestamp: new Date().toISOString(),
                status: 'failed'
            });

            return { success: false, error: error.message };
        }
    }

    /**
     * Record backup history di database
     */
    async recordBackup(backupInfo) {
        try {
            const { data, error } = await this.supabase
                .from('backup_history')
                .insert([backupInfo]);

            if (error) throw error;
            
            this.backupHistory.push(backupInfo);
            return data;
        } catch (error) {
            console.error('[BackupManager] Failed to record backup:', error);
        }
    }

    /**
     * Get backup history
     */
    async getBackupHistory(type = null, limit = 50) {
        try {
            let query = this.supabase
                .from('backup_history')
                .select('*')
                .order('timestamp', { ascending: false })
                .limit(limit);

            if (type) {
                query = query.eq('type', type);
            }

            const { data, error } = await query;
            if (error) throw error;

            return data;
        } catch (error) {
            console.error('[BackupManager] Failed to get backup history:', error);
            return [];
        }
    }

    /**
     * Restore dari backup
     */
    async restoreBackup(backupName, type) {
        try {
            console.log(`[BackupManager] Restoring ${type} backup: ${backupName}`);

            const backupPath = `backups/${type}/${backupName}`;
            const content = await this.r2.downloadFile(backupPath);

            if (type === 'database') {
                // Execute SQL restore
                return await this.restoreDatabaseBackup(content);
            } else if (type === 'config') {
                // Restore config
                return await this.restoreConfigBackup(JSON.parse(content.toString()));
            }

            return { success: false, error: 'Unknown backup type' };
        } catch (error) {
            console.error('[BackupManager] Restore failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Helper functions
     */
    readJsonFile(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            }
        } catch (error) {
            console.warn(`[BackupManager] Failed to read ${filePath}:`, error.message);
        }
        return null;
    }

    getQueueCount() {
        try {
            const queuePath = path.join(__dirname, '..', 'data', 'storage-sync-queue.json');
            if (fs.existsSync(queuePath)) {
                const data = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
                return Array.isArray(data) ? data.length : 0;
            }
        } catch (error) {
            console.warn('[BackupManager] Failed to count queue:', error.message);
        }
        return 0;
    }

    getRecentLogs(lineCount) {
        try {
            const logDir = path.join(__dirname, '..', 'data', 'log');
            if (!fs.existsSync(logDir)) return [];

            const files = fs.readdirSync(logDir).sort().reverse();
            const logs = [];

            for (const file of files) {
                if (logs.length >= lineCount) break;
                const content = fs.readFileSync(path.join(logDir, file), 'utf-8');
                logs.push(...content.split('\n').slice(-10));
            }

            return logs.slice(0, lineCount);
        } catch (error) {
            console.warn('[BackupManager] Failed to get logs:', error.message);
        }
        return [];
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    async restoreDatabaseBackup(sqlContent) {
        // Implement SQL execution logic based on your DB
        console.log('[BackupManager] Database restore not yet implemented');
        return { success: false, error: 'Not implemented' };
    }

    async restoreConfigBackup(configData) {
        try {
            const syncStatusPath = path.join(__dirname, '..', 'data', 'storage-sync-status.json');
            fs.writeFileSync(syncStatusPath, JSON.stringify(configData.config.syncStatus, null, 2));
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = BackupManager;
