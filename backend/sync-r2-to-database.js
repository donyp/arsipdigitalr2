// ============================================================
// SYNC R2 BUCKET TO DATABASE - Backfill missing file records
// ============================================================
// If files exist in R2 but not in database, this script will scan
// R2 and create file records in the database.
//
// Usage: node backend/sync-r2-to-database.js
// ============================================================

const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const s3Client = new S3Client({
    region: 'auto',
    credentials: {
        accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID,
        secretAccessKey: process.env.CLOUDFLARE_ACCESS_KEY_SECRET
    },
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
});

const bucketName = process.env.CLOUDFLARE_R2_BUCKET || 'ankadigital';

async function syncR2ToDatabase() {
    try {
        console.log(`\n🔄 Scanning R2 bucket: ${bucketName}`);
        
        let continuationToken = null;
        let isTruncated = true;
        let filesScanned = 0;
        let filesCreated = 0;
        let filesSkipped = 0;
        const batch = [];

        while (isTruncated) {
            const command = new ListObjectsV2Command({
                Bucket: bucketName,
                ContinuationToken: continuationToken,
                MaxKeys: 1000
            });

            const response = await s3Client.send(command);
            const objects = response.Contents || [];

            console.log(`📦 Processing batch of ${objects.length} files...`);

            for (const obj of objects) {
                filesScanned++;

                // Skip if object is a "folder" (key ends with /)
                if (obj.Key.endsWith('/')) {
                    filesSkipped++;
                    continue;
                }

                // Parse path to extract zona, toko, category
                const pathParts = obj.Key.split('/').filter(p => p);
                let zona_id = null;
                let toko_id = null;
                let category = null;

                // Typical path: ARSIP/ZONA_XX/TOKO_YY/CATEGORY/filename.pdf
                if (pathParts.length >= 4) {
                    const zonaMatch = pathParts[1]?.match(/\d+/);
                    if (zonaMatch) zona_id = parseInt(zonaMatch[0]);
                    
                    const tokoMatch = pathParts[2]?.match(/\d+/);
                    if (tokoMatch) toko_id = parseInt(tokoMatch[0]);
                    
                    category = pathParts[3];
                }

                // Check if file already exists in database
                const { data: existing } = await supabase
                    .from('files')
                    .select('id')
                    .eq('storage_path', obj.Key)
                    .maybeSingle();

                if (existing) {
                    filesSkipped++;
                    continue;
                }

                // Skip files without zona_id (required field)
                if (!zona_id) {
                    filesSkipped++;
                    console.log(`⊘ Skipped (no zona): ${obj.Key}`);
                    continue;
                }

                // Create file record
                const filename = obj.Key.split('/').pop();
                const fileRecord = {
                    nama_file: filename,
                    storage_path: obj.Key,
                    ukuran_bytes: obj.Size,
                    category: category || 'OTHER',
                    zona_id: zona_id, // Required
                    toko_id: toko_id || null,
                    status: 'verified',
                    created_at: new Date().toISOString(),
                    uploaded_by: null
                };

                batch.push(fileRecord);

                // Insert batch every 100 files
                if (batch.length >= 100) {
                    const { error } = await supabase
                        .from('files')
                        .insert(batch);

                    if (error) {
                        console.error('❌ Batch insert error:', error.message);
                    } else {
                        filesCreated += batch.length;
                        console.log(`✅ Created ${batch.length} file records (total: ${filesCreated})`);
                    }

                    batch.length = 0;
                }
            }

            isTruncated = response.IsTruncated;
            continuationToken = response.NextContinuationToken;

            if (filesScanned % 1000 === 0) {
                console.log(`Progress: ${filesScanned} files scanned, ${filesCreated} created, ${filesSkipped} skipped`);
            }
        }

        // Insert remaining files
        if (batch.length > 0) {
            const { error } = await supabase
                .from('files')
                .insert(batch);

            if (error) {
                console.error('❌ Final batch insert error:', error.message);
            } else {
                filesCreated += batch.length;
                console.log(`✅ Created ${batch.length} file records (final batch)`);
            }
        }

        console.log(`\n✅ Sync complete!`);
        console.log(`   - Files scanned: ${filesScanned}`);
        console.log(`   - Files created: ${filesCreated}`);
        console.log(`   - Files skipped: ${filesSkipped}`);
        console.log(`   - Total in database: ${filesCreated}\n`);

    } catch (error) {
        console.error('❌ Sync failed:', error.message);
        process.exit(1);
    }
}

syncR2ToDatabase().then(() => {
    console.log('Done!');
    process.exit(0);
});
