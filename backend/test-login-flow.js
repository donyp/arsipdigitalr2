#!/usr/bin/env node
/**
 * Test complete 2FA login flow
 */

require('dotenv').config();
const https = require('https');

const API_URL = 'http://localhost:5000';

async function makeRequest(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(API_URL + endpoint);
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = require('http').request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        data: JSON.parse(data)
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        data: data
                    });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function test() {
    console.log('\n=== TESTING 2FA LOGIN FLOW ===\n');

    try {
        // Step 1: Get test users
        console.log('1️⃣  Getting test users...');
        const usersRes = await makeRequest('GET', '/api/dev/test-users');
        if (!usersRes.data.success || usersRes.data.users.length === 0) {
            console.error('❌ No users found');
            process.exit(1);
        }

        const testUser = usersRes.data.users[0];
        console.log(`   ✅ Found user: ${testUser.username} (${testUser.email})`);

        // Step 2: Generate tokens
        console.log('\n2️⃣  Generating tokens for all users...');
        const generateRes = await makeRequest('POST', '/api/dev/test-generate-tokens');
        console.log(`   Status: ${generateRes.status}`);
        console.log(`   Success: ${generateRes.data.success}`);
        console.log(`   Generated: ${generateRes.data.generated}`);
        console.log(`   Sent: ${generateRes.data.sent}`);
        if (generateRes.data.error) {
            console.error(`   ❌ Error: ${generateRes.data.error}`);
        }

        // Step 3: Check user token status
        console.log(`\n3️⃣  Checking token status for user: ${testUser.id}`);
        const tokenRes = await makeRequest('GET', `/api/dev/debug-user-tokens/${testUser.id}`);
        console.log(`   Token count: ${tokenRes.data.tokenCount}`);
        if (tokenRes.data.tokens && tokenRes.data.tokens.length > 0) {
            const token = tokenRes.data.tokens[0];
            console.log(`   Token: ${token.token}`);
            console.log(`   Email sent: ${token.email_sent}`);
            console.log(`   Expires at: ${token.expires_at}`);
            console.log(`   ✅ Token found!`);

            // Step 4: Try login
            console.log('\n4️⃣  Testing login (password verification)...');
            console.log(`   Note: You need to provide the correct password for ${testUser.username}`);
            console.log(`   Test user email: ${testUser.email}`);
            console.log(`   Token code: ${token.token}`);
        } else {
            console.warn(`   ⚠️  No valid tokens found for user`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }

    console.log('\n✅ Test complete!\n');
}

test();
