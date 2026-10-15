#!/usr/bin/env node
/**
 * Test full backup API flow: login → history → download
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runTest() {
    try {
        console.log('=== Testing Backup API Full Flow ===\n');

        // Step 1: Get an admin user to get JWT token
        console.log('1️⃣  Getting admin user...');
        const { data: adminUsers, error: userError } = await supabase
            .from('users')
            .select('id, email, role')
            .eq('role', 'admin')
            .limit(1);

        if (userError) throw userError;
        if (!adminUsers || adminUsers.length === 0) {
            throw new Error('No admin user found');
        }

        const adminUser = adminUsers[0];
        console.log(`   Found admin: ${adminUser.email}\n`);

        // Step 2: Generate JWT token
        console.log('2️⃣  Generating JWT token...');
        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
            { 
                sub: adminUser.id,
                email: adminUser.email,
                role: adminUser.role,
                iat: Math.floor(Date.now() / 1000)
            },
            process.env.JWT_SECRET || 'test-secret',
            { expiresIn: '24h' }
        );
        console.log(`   Token: ${token.substring(0, 30)}...\n`);

        // Step 3: Fetch backup history
        console.log('3️⃣  Fetching backup history...');
        const fetch = (await import('node-fetch')).default;
        const histResp = await fetch('http://localhost:5000/api/backups/history', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!histResp.ok) {
            throw new Error(`History fetch failed: ${histResp.status}`);
        }

        const histData = await histResp.json();
        console.log(`   Found ${histData.data?.length || 0} backups\n`);

        // Step 4: Try to download first backup
        if (histData.data?.length > 0) {
            const backup = histData.data[0];
            console.log(`4️⃣  Downloading: ${backup.name}`);
            console.log(`   Type: ${backup.type}`);
            console.log(`   Size: ${backup.size} bytes\n`);

            const dlResp = await fetch(
                `http://localhost:5000/api/backups/download/${backup.name}?type=${backup.type}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );

            console.log(`   Response status: ${dlResp.status}`);
            console.log(`   Response headers:`);
            dlResp.headers.forEach((value, name) => {
                console.log(`     ${name}: ${value}`);
            });

            if (!dlResp.ok) {
                const text = await dlResp.text();
                console.log(`   ❌ Error: ${text}`);
                throw new Error(`Download failed: ${dlResp.status}`);
            }

            const content = await dlResp.text();
            console.log(`   ✅ Downloaded ${content.length} bytes\n`);
            console.log(`   Content: ${content.substring(0, 100)}...`);
        } else {
            console.log('❌ No backups to download\n');
        }

        console.log('\n✅ Test completed!');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error);
    }

    process.exit(0);
}

runTest();
