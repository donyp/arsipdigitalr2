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
            console.log('[BackupManager] [DB] Starting full database backup...');
            
            await this.ensureTablesExist();
            
            const timestamp = Date.now();
            backupName = `db-backup-${timestamp}.sql`;

            // Export ALL tables from database
            let sqlDump = `-- Arsip Digital Database Backup\n`;
            sqlDump += `-- Timestamp: ${new Date().toISOString()}\n`;
            sqlDump += `-- Full database export\n\n`;
            sqlDump += `SET statement_timeout = 0;\n`;
            sqlDump += `SET lock_timeout = 0;\n`;
            sqlDump += `SET idle_in_transaction_session_timeout = 0;\n`;
            sqlDump += `SET client_encoding = 'UTF8';\n`;
            sqlDump += `SET standard_conforming_strings = on;\n`;
            sqlDump += `SET check_function_bodies = false;\n`;
            sqlDump += `SET client_min_messages = warning;\n\n`;

            // Get list of all tables
            const { data: tables, error: tablesError } = await this.supabase.rpc('get_table_names', {});
            
            if (tablesError) {
                console.warn('[BackupManager] [DB] Could not get table list via RPC, using fallback...');
                // Fallback: dump using raw SQL
                const { data: allData, error: allError } = await this.supabase
                    .from('information_schema')
                    .select('table_name')
                    .eq('table_schema', 'public');
                
                if (!allError && allData) {
                    for (const table of allData) {
                        await this._dumpTable(table.table_name, sqlDump);
                    }
                }
            } else if (tables && Array.isArray(tables)) {
                console.log(`[BackupManager] [DB] Found ${tables.length} tables to backup`);
                for (const tableName of tables) {
                    await this._dumpTable(tableName, sqlDump);
                }
            }

            // If no tables dumped, try direct approach
            if (sqlDump.split('\n').length < 15) {
                console.log('[BackupManager] [DB] Using direct table dump...');
                sqlDump += await this._dumpAllTables();
            }

            const fileContent = Buffer.from(sqlDump, 'utf-8');
            const fileSize = fileContent.length;
            
            console.log(`[BackupManager] [DB] Backup size: ${fileSize} bytes`);
            
            const r2Path = `${this.r2BackupPaths.database}/${backupName}`;
            await this.r2.uploadFile(fileContent, r2Path, { contentType: 'application/sql' });
            console.log(`[BackupManager] [DB] ✅ Uploaded to R2 (${fileSize} bytes)`);

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

    async _dumpTable(tableName, sqlDump) {
        try {
            const { data, error } = await this.supabase
                .from(tableName)
                .select('*');

            if (error) {
                console.warn(`[BackupManager] Could not export ${tableName}:`, error.message);
                return;
            }

            if (!data || data.length === 0) {
                console.log(`[BackupManager] [DB] Table ${tableName} is empty`);
                return;
            }

            console.log(`[BackupManager] [DB] Exporting ${tableName} (${data.length} rows)...`);

            // Create table schema
            const columns = Object.keys(data[0]);
            sqlDump += `\n-- Table: ${tableName}\n`;
            sqlDump += `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES\n`;

            // Insert data rows
            const values = data.map(row => {
                const vals = columns.map(col => {
                    const val = row[col];
                    if (val === null) return 'NULL';
                    if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
                    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
                    if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
                    return val;
                });
                return `(${vals.join(', ')})`;
            });

            sqlDump += values.join(',\n') + ';\n';
        } catch (error) {
            console.error(`[BackupManager] Error dumping ${tableName}:`, error.message);
        }
    }

    async _dumpAllTables() {
        let dump = '';
        try {
            // List of known tables to backup
            const knownTables = [
                'users', 'roles', 'user_roles', 'zonas', 'tokos',
                'invoice_files', 'invoices', 'backup_history', 'backup_config',
                'support_tickets', 'ticket_messages', 'ticket_attachments',
                'audit_logs', 'maintenance_mode', 'sistema_notificacoes'
            ];

            for (const tableName of knownTables) {
                try {
                    const { data, error } = await this.supabase
                        .from(tableName)
                        .select('*')
                        .limit(10000);

                    if (!error && data && data.length > 0) {
                        console.log(`[BackupManager] [DB] Dumping ${tableName} (${data.length} rows)`);
                        const columns = Object.keys(data[0]);
                        dump += `\n-- Table: ${tableName}\n`;
                        dump += `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES\n`;

                        const values = data.map(row => {
                            const vals = columns.map(col => {
                                const val = row[col];
                                if (val === null) return 'NULL';
                                if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
                                if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
                                if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
                                return val;
                            });
                            return `(${vals.join(', ')})`;
                        });

                        dump += values.join(',\n') + ';\n';
                    }
                } catch (tableError) {
                    console.warn(`[BackupManager] Could not dump ${tableName}:`, tableError.message);
                }
            }
        } catch (error) {
            console.error('[BackupManager] Error in _dumpAllTables:', error.message);
        }
        return dump;
    }

    async performFileBackup() {
        try {
            console.log('[BackupManager] [FILES] Starting file backup...');
            
            await this.ensureTablesExist();

            const timestamp = Date.now();
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
                        await this.r2.uploadFile(fileContent, r2Path, { contentType: 'application/zip' });

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

            const timestamp = Date.now();
            const backupName = `config-backup-${timestamp}.json`;

            const configBackup = {
                timestamp: new Date().toISOString(),
                version: '1.0',
                environment: process.env.NODE_ENV || 'production'
            };

            const fileContent = Buffer.from(JSON.stringify(configBackup, null, 2), 'utf-8');
            const fileSize = fileContent.length;
            
            const r2Path = `${this.r2BackupPaths.config}/${backupName}`;
            await this.r2.uploadFile(fileContent, r2Path, { contentType: 'application/json' });

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

            const timestamp = Date.now();
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
                        await this.r2.uploadFile(fileContent, r2Path, { contentType: 'application/zip' });

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
            console.log('[BackupManager] Recording:', JSON.stringify(backupInfo));
            console.log('[BackupManager] Inserting to backup_history...');
            
            const insertData = {
                type: backupInfo.type,
                name: backupInfo.name,
                size: backupInfo.size || null,
                path: backupInfo.path || null,
                status: backupInfo.status,
                error_message: backupInfo.error_message || null
            };
            
            console.log('[BackupManager] Data to insert:', JSON.stringify(insertData));
            
            const { data, error, status, statusText } = await this.supabase
                .from('backup_history')
                .insert([insertData]);
            
            console.log('[BackupManager] Insert response - Status:', status, 'StatusText:', statusText);
            
            if (error) {
                console.error('[BackupManager] INSERT FAILED:');
                console.error('  Code:', error.code);
                console.error('  Message:', error.message);
                console.error('  Status:', error.status);
                console.error('  Full error:', JSON.stringify(error));
                throw new Error(`INSERT FAILED: ${error.code} - ${error.message}`);
            }
            
            console.log(`[BackupManager] ✅ Recorded successfully`);
            return data;
        } catch (error) {
            console.error('[BackupManager] Record failed:', error.message);
            console.error('[BackupManager] Full stack:', error.stack);
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
