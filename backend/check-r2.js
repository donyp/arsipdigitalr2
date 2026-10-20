const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
require('dotenv').config();

const s3Client = new S3Client({
    region: 'auto',
    credentials: {
        accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID,
        secretAccessKey: process.env.CLOUDFLARE_ACCESS_KEY_SECRET
    },
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
});

async function checkR2() {
    try {
        const command = new ListObjectsV2Command({
            Bucket: process.env.CLOUDFLARE_R2_BUCKET || 'ankadigital',
            MaxKeys: 10
        });

        const response = await s3Client.send(command);
        const objects = response.Contents || [];

        console.log('Files in R2:', objects.length);
        objects.forEach(obj => {
            console.log('  -', obj.Key, '(' + (obj.Size / 1024).toFixed(2) + ' KB)');
        });

        console.log('\nTotal objects estimate:', response.KeyCount);
    } catch (err) {
        console.error('Error:', err.message);
    }
}

checkR2();
