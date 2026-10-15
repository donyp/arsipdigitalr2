#!/usr/bin/env node
/**
 * List all files in R2 bucket to see what was actually uploaded
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const r2Storage = require('./r2-storage');

async function listFiles() {
    try {
        console.log('Listing R2 files...\n');
        console.log('Environment:');
        console.log('  Bucket:', process.env.CLOUDFLARE_R2_BUCKET);
        console.log('  Account:', process.env.CLOUDFLARE_ACCOUNT_ID?.substring(0, 10) + '...');
        console.log('');

        // List backups
        console.log('📁 Backups in R2:');
        const backups = await r2Storage.listFiles('backups/');
        if (backups.length > 0) {
            backups.forEach(file => {
                console.log(`   ${file.key} (${file.size} bytes, ${new Date(file.lastModified).toISOString()})`);
            });
        } else {
            console.log('   (none found)');
        }

        // List database backups specifically
        console.log('\n📁 Database backups in R2:');
        const dbBackups = await r2Storage.listFiles('backups/database/');
        if (dbBackups.length > 0) {
            dbBackups.forEach(file => {
                console.log(`   ${file.key} (${file.size} bytes)`);
            });
        } else {
            console.log('   (none found)');
        }

        // Try to download one specific backup
        if (dbBackups.length > 0) {
            console.log('\n🔽 Testing download of first backup...');
            const firstBackup = dbBackups[0];
            try {
                const content = await r2Storage.downloadFile(firstBackup.key);
                console.log(`   ✅ Success! Downloaded ${content.length} bytes from: ${firstBackup.key}`);
            } catch (err) {
                console.log(`   ❌ Failed to download: ${firstBackup.key}`);
                console.log(`      Error: ${err.message}`);
                console.log(`      Status: ${err.$metadata?.httpStatusCode}`);
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    }

    process.exit(0);
}

listFiles();
