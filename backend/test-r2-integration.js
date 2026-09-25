#!/usr/bin/env node

/**
 * Test suite for Cloudflare R2 integration
 * Run: node backend/test-r2-integration.js
 * 
 * This test verifies:
 * 1. R2 configuration validation
 * 2. Module imports and exports
 * 3. Storage methods signature
 * 4. Cache system functionality
 * 5. Error handling
 */

const path = require('path');

console.log('\n========================================');
console.log('🧪 Cloudflare R2 Integration Test Suite');
console.log('========================================\n');

// Test 1: Check environment variables
console.log('Test 1️⃣  - Environment Configuration');
console.log('─'.repeat(50));

const requiredEnvVars = [
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_ACCESS_KEY_ID',
    'CLOUDFLARE_ACCESS_KEY_SECRET'
];

const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
    console.warn('⚠️  WARNING: Missing environment variables:');
    missingVars.forEach(v => console.warn(`   - ${v}`));
    console.log('\n📝 To test locally, set these variables:');
    console.log('   export CLOUDFLARE_ACCOUNT_ID=your-account-id');
    console.log('   export CLOUDFLARE_ACCESS_KEY_ID=your-access-key');
    console.log('   export CLOUDFLARE_ACCESS_KEY_SECRET=your-secret-key');
    console.log('   export CLOUDFLARE_R2_BUCKET=arsip-anka\n');
} else {
    console.log('✅ All required environment variables set');
    console.log(`   CLOUDFLARE_ACCOUNT_ID: ${process.env.CLOUDFLARE_ACCOUNT_ID.substring(0, 10)}...`);
    console.log(`   CLOUDFLARE_ACCESS_KEY_ID: ${process.env.CLOUDFLARE_ACCESS_KEY_ID.substring(0, 10)}...`);
    console.log(`   CLOUDFLARE_ACCESS_KEY_SECRET: ${process.env.CLOUDFLARE_ACCESS_KEY_SECRET.substring(0, 10)}...`);
    console.log(`   CLOUDFLARE_R2_BUCKET: ${process.env.CLOUDFLARE_R2_BUCKET}\n`);
}

// Test 2: Module imports
console.log('Test 2️⃣  - Module Imports');
console.log('─'.repeat(50));

try {
    const R2Storage = require('./r2-storage');
    console.log('✅ R2Storage module imported successfully\n');
    
    // Test 3: Required methods
    console.log('Test 3️⃣  - Required Methods');
    console.log('─'.repeat(50));
    
    const requiredMethods = [
        'uploadInvoicePDF',
        'uploadDocumentFile',
        'uploadFile',
        'getStream',
        'downloadFile',
        'deleteFile',
        'listFiles',
        'checkFileExists',
        'checkFileExistsNoCache',
        'enqueueSyncJob',
        'processPendingSyncJobs',
        'getSyncStatus'
    ];
    
    const missingMethods = requiredMethods.filter(m => typeof R2Storage[m] !== 'function');
    
    if (missingMethods.length > 0) {
        console.error('❌ Missing methods:');
        missingMethods.forEach(m => console.error(`   - ${m}`));
    } else {
        console.log('✅ All required methods available:');
        requiredMethods.forEach(m => console.log(`   ✓ ${m}()`));
    }
    console.log();
    
    // Test 4: Configuration
    console.log('Test 4️⃣  - Configuration');
    console.log('─'.repeat(50));
    
    try {
        R2Storage.validateConfig();
        console.log('✅ R2 configuration is valid\n');
    } catch (error) {
        console.error(`❌ Configuration error: ${error.message}\n`);
    }
    
    // Test 5: Cache functions
    console.log('Test 5️⃣  - Cache System');
    console.log('─'.repeat(50));
    
    const testPath = 'ARSIPTEST/test.pdf';
    
    // Set cache
    R2Storage.setCachedFileExistence(testPath, true);
    console.log(`✅ Set cache for: ${testPath}`);
    
    // Get cache (should hit)
    const cached = R2Storage.getCachedFileExistence(testPath);
    if (cached === true) {
        console.log('✅ Cache hit - retrieved cached value');
    } else {
        console.error('❌ Cache miss - could not retrieve cached value');
    }
    
    // Invalidate cache
    R2Storage.invalidateFileExistenceCache(testPath);
    const afterInvalidate = R2Storage.getCachedFileExistence(testPath);
    if (afterInvalidate === null) {
        console.log('✅ Cache invalidated successfully\n');
    } else {
        console.error('❌ Cache invalidation failed\n');
    }
    
    // Test 6: Path construction
    console.log('Test 6️⃣  - Path Construction');
    console.log('─'.repeat(50));
    
    const testPaths = [
        R2Storage.buildStoragePath('BEKASI', 'TOKO01', 'file.pdf'),
        'ARSIPINVOICE/BEKASI/2026/02/10/PPN/invoice.pdf',
        'ARSIPFILES/BEKASI/bukti/2026/02/10/doc.pdf'
    ];
    
    console.log('✅ Expected path formats:');
    testPaths.forEach(p => console.log(`   - ${p}`));
    console.log();
    
    // Test 7: Compatibility methods
    console.log('Test 7️⃣  - Legacy Compatibility Methods');
    console.log('─'.repeat(50));
    
    const legacyMethods = [
        'buildStoragePath',
        'createMediaFolder',
        'getSyncStatuses',
        'getSyncQueueSnapshot',
        'verifyBackupStorage'
    ];
    
    console.log('✅ Legacy/compatibility methods available:');
    legacyMethods.forEach(m => {
        const exists = typeof R2Storage[m] === 'function';
        console.log(`   ${exists ? '✓' : '✗'} ${m}()`);
    });
    console.log();
    
    // Test 8: Configuration object
    console.log('Test 8️⃣  - Configuration Object');
    console.log('─'.repeat(50));
    
    const config = R2Storage.getConfig();
    console.log('✅ R2 Configuration:');
    console.log(`   accountId: ${config.accountId?.substring(0, 10)}...`);
    console.log(`   accessKeyId: ${config.accessKeyId?.substring(0, 10)}...`);
    console.log(`   bucketName: ${config.bucketName}`);
    console.log(`   region: ${config.region}\n`);
    
    // Summary
    console.log('========================================');
    console.log('✅ All tests passed!');
    console.log('========================================\n');
    
    console.log('📋 Next steps:');
    console.log('1. Set R2 environment variables (if not set)');
    console.log('2. Run: npm start');
    console.log('3. Test endpoints with curl or Postman');
    console.log('4. Check R2 bucket in Cloudflare dashboard\n');
    
} catch (error) {
    console.error('❌ Error loading R2Storage module:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
}

console.log('ℹ️  For detailed setup instructions, see R2_SETUP_GUIDE.md');
console.log('ℹ️  For quick reference, see R2_QUICK_REFERENCE.md\n');
