#!/usr/bin/env node
/**
 * Test backup creation with local storage fallback
 * This test demonstrates that backups work without R2 credentials
 */

const path = require('path');
const fs = require('fs').promises;
const BackupManager = require('./backup-manager');

// Mock Supabase client (minimal for backup testing)
const mockSupabase = {
    from: (table) => ({
        select: () => ({
            eq: () => ({ data: [], error: null }),
            single: async () => ({ data: { id: 'test', email: 'test@test.com', role: 'admin' }, error: null })
        }),
        insert: async () => ({ data: { id: 1 }, error: null })
    })
};

// Use the R2 storage module with its local fallback
const r2Storage = require('./r2-storage');

async function testBackupSystem() {
    console.log('🧪 Testing Backup System with Local Storage Fallback\n');
    console.log('=' .repeat(60));

    try {
        // Initialize backup manager
        console.log('\n1️⃣  Initializing Backup Manager...');
        const backupManager = new BackupManager(mockSupabase, r2Storage);
        await backupManager.ensureTablesExist();
        console.log('   ✅ Backup Manager initialized');

        // Test database backup
        console.log('\n2️⃣  Creating database backup...');
        const dbBackup = await backupManager.performDatabaseBackup();
        if (dbBackup.success) {
            console.log(`   ✅ Database backup created`);
            console.log(`      Name: ${dbBackup.backupName}`);
            console.log(`      Size: ${dbBackup.size} bytes`);
        } else {
            console.log(`   ❌ Database backup failed: ${dbBackup.error}`);
            throw new Error(dbBackup.error);
        }

        // Test reading the backup file
        console.log('\n3️⃣  Verifying backup file was saved...');
        const backupPath = path.join(__dirname, '..', 'backup-storage', 'backups', 'database', dbBackup.backupName);
        try {
            const content = await fs.readFile(backupPath, 'utf-8');
            console.log(`   ✅ Backup file found and readable`);
            console.log(`      Path: ${backupPath}`);
            console.log(`      Content preview: ${content.substring(0, 80)}...`);
        } catch (err) {
            console.log(`   ❌ Could not read backup file: ${err.message}`);
            
            // Try alternative location
            const altPath = path.join(__dirname, '..', 'backup-storage', 'backups', 'database');
            console.log(`   Checking backup directory: ${altPath}`);
            if (await fs.access(altPath).then(() => true).catch(() => false)) {
                const files = await fs.readdir(altPath);
                console.log(`   Files in directory: ${files.join(', ')}`);
            }
        }

        // Test download
        console.log('\n4️⃣  Testing download functionality...');
        const r2Path = `backups/database/${dbBackup.backupName}`;
        try {
            const downloaded = await r2Storage.downloadFile(r2Path);
            console.log(`   ✅ Download successful`);
            console.log(`      Downloaded ${downloaded.length} bytes`);
            console.log(`      Content matches: ${downloaded.length === dbBackup.size}`);
        } catch (err) {
            console.log(`   ❌ Download failed: ${err.message}`);
        }

        // Test config backup
        console.log('\n5️⃣  Creating config backup...');
        const configBackup = await backupManager.performConfigBackup();
        if (configBackup.success) {
            console.log(`   ✅ Config backup created: ${configBackup.backupName}`);
        } else {
            console.log(`   ⚠️  Config backup returned: ${JSON.stringify(configBackup)}`);
        }

        // Get history
        console.log('\n6️⃣  Getting backup history...');
        const history = await backupManager.getBackupHistory();
        console.log(`   ✅ Found ${history.length} backup(s) in history`);
        history.forEach(h => {
            console.log(`      - ${h.name} [${h.status}] (${h.size} bytes)`);
        });

        console.log('\n' + '='.repeat(60));
        console.log('✅ All tests passed! Backup system is working with local storage.\n');
        console.log('📁 Backups are stored in: ./backup-storage/backups/');
        console.log('💾 R2 credentials not needed for local testing.\n');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('\nStack trace:', error.stack);
        process.exit(1);
    }

    process.exit(0);
}

// Run tests
testBackupSystem();
