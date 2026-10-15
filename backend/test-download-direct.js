#!/usr/bin/env node
/**
 * Test download directly using R2 storage module
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const r2Storage = require('./r2-storage');

async function testDownload() {
    try {
        console.log('Testing R2 download directly...\n');
        console.log('Environment check:');
        console.log('  CLOUDFLARE_ACCOUNT_ID:', process.env.CLOUDFLARE_ACCOUNT_ID?.substring(0, 10) + '...');
        console.log('  CLOUDFLARE_ACCESS_KEY_ID:', process.env.CLOUDFLARE_ACCESS_KEY_ID?.substring(0, 10) + '...');
        console.log('  CLOUDFLARE_R2_BUCKET:', process.env.CLOUDFLARE_R2_BUCKET);
        console.log('');
        
        // Try to download the backup that was just created
        const backupPath = 'backups/database/db-backup-1792052642138.sql';
        
        console.log(`Attempting to download: ${backupPath}\n`);
        
        const content = await r2Storage.downloadFile(backupPath);
        
        console.log(`✅ Success! Downloaded ${content.length} bytes`);
        console.log(`Content: ${content.toString()}`);
        
    } catch (error) {
        console.error('❌ Download failed!');
        console.error('Error message:', error.message);
        console.error('Error code:', error.Code);
        console.error('Status code:', error.$metadata?.httpStatusCode);
        console.error('Full error:', JSON.stringify(error, null, 2));
    }
    
    process.exit(0);
}

testDownload();
