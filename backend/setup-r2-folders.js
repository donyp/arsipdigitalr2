#!/usr/bin/env node

/**
 * Setup R2 folder structure to match GDrive organization
 * Run: node backend/setup-r2-folders.js
 * 
 * This creates the following structure in R2:
 * - ARSIPINVOICE/{location}/{year}/{month}/{day}/{category}/
 * - ARSIPFILES/{location}/{type}/{year}/{month}/{day}/
 */

require('dotenv').config();
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');

// Initialize S3 client
const s3Client = new S3Client({
    region: 'auto',
    credentials: {
        accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID,
        secretAccessKey: process.env.CLOUDFLARE_ACCESS_KEY_SECRET
    },
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
});

const bucketName = process.env.CLOUDFLARE_R2_BUCKET || 'arsip-anka';

// Folder structure based on GDrive
const LOCATIONS = [
    'BEKASI',
    'JAKARTA',
    'BANDUNG',
    'SURABAYA',
    'MEDAN',
    'SEMARANG',
    'YOGYAKARTA',
    'PALEMBANG',
    'MAKASSAR',
    'BALARAJA'
];

const CATEGORIES = [
    'PPN',
    'NON',
    'PIUTANG',
    'INVOICE'
];

const DOCUMENT_TYPES = [
    'bukti-bayar',
    'faktur-pajak',
    'dokumen-pendukung'
];

const YEARS = [2024, 2025, 2026, 2027];
const MONTHS = Array.from({length: 12}, (_, i) => String(i + 1).padStart(2, '0'));
const DAYS = Array.from({length: 28}, (_, i) => String(i + 1).padStart(2, '0'));

console.log('\n🚀 Cloudflare R2 - Folder Structure Setup');
console.log('═'.repeat(60));
console.log(`Bucket: ${bucketName}`);
console.log(`Account ID: ${process.env.CLOUDFLARE_ACCOUNT_ID}`);
console.log('═'.repeat(60) + '\n');

// Verify credentials
if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_ACCESS_KEY_ID || !process.env.CLOUDFLARE_ACCESS_KEY_SECRET) {
    console.error('❌ Missing Cloudflare credentials');
    process.exit(1);
}

async function createFolder(folderPath) {
    try {
        // Create a placeholder file to represent the folder
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: folderPath + '.placeholder',
            Body: Buffer.from(''),
            Metadata: { 'folder-marker': 'true' }
        });
        
        await s3Client.send(command);
        return true;
    } catch (error) {
        console.error(`❌ Error creating folder ${folderPath}:`, error.message);
        return false;
    }
}

async function setupFolderStructure() {
    const folders = [];
    let createdCount = 0;
    let failedCount = 0;

    console.log('📁 Creating folder structure...\n');

    // ARSIPINVOICE structure: {location}/{year}/{month}/{day}/{category}/
    console.log('📋 ARSIPINVOICE Folders:');
    for (const location of LOCATIONS) {
        for (const year of YEARS) {
            for (const month of MONTHS) {
                for (const day of DAYS) {
                    for (const category of CATEGORIES) {
                        const folderPath = `ARSIPINVOICE/${location}/${year}/${month}/${day}/${category}/`;
                        folders.push(folderPath);
                    }
                }
            }
        }
    }

    // Create ARSIPINVOICE folders
    for (let i = 0; i < folders.length; i++) {
        const folderPath = folders[i];
        const success = await createFolder(folderPath);
        
        if (success) {
            createdCount++;
            if ((i + 1) % 100 === 0) {
                console.log(`   ✓ Created ${i + 1}/${folders.length} invoice folders...`);
            }
        } else {
            failedCount++;
        }
    }
    console.log(`   ✅ Invoice folders: ${createdCount} created, ${failedCount} failed\n`);

    // ARSIPFILES structure: {location}/{type}/{year}/{month}/{day}/
    console.log('📄 ARSIPFILES Folders:');
    folders.length = 0;
    createdCount = 0;
    failedCount = 0;

    for (const location of LOCATIONS) {
        for (const docType of DOCUMENT_TYPES) {
            for (const year of YEARS) {
                for (const month of MONTHS) {
                    for (const day of DAYS) {
                        const folderPath = `ARSIPFILES/${location}/${docType}/${year}/${month}/${day}/`;
                        folders.push(folderPath);
                    }
                }
            }
        }
    }

    // Create ARSIPFILES folders
    for (let i = 0; i < folders.length; i++) {
        const folderPath = folders[i];
        const success = await createFolder(folderPath);
        
        if (success) {
            createdCount++;
            if ((i + 1) % 100 === 0) {
                console.log(`   ✓ Created ${i + 1}/${folders.length} document folders...`);
            }
        } else {
            failedCount++;
        }
    }
    console.log(`   ✅ Document folders: ${createdCount} created, ${failedCount} failed\n`);

    console.log('═'.repeat(60));
    console.log('📊 Summary:');
    console.log(`   Locations: ${LOCATIONS.length}`);
    console.log(`   Invoice Categories: ${CATEGORIES.length}`);
    console.log(`   Document Types: ${DOCUMENT_TYPES.length}`);
    console.log(`   Years: ${YEARS.length}`);
    console.log(`   Months: ${MONTHS.length}`);
    console.log(`   Days: ${DAYS.length}`);
    console.log('═'.repeat(60));
    console.log('\n✅ R2 folder structure setup complete!\n');
}

// Run setup
setupFolderStructure().catch(error => {
    console.error('❌ Setup failed:', error);
    process.exit(1);
});
