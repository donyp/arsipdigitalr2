#!/usr/bin/env node
/**
 * Test backup creation and download functionality
 * Usage: node test-backup-download.js
 */

const http = require('http');
const querystring = require('querystring');

const API_BASE = 'http://localhost:5000';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

// Helper: Make HTTP request
function makeRequest(method, path, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
        try {
            const url = new URL(path, API_BASE);
            const bodyStr = body ? JSON.stringify(body) : '';
            const options = {
                hostname: url.hostname,
                port: url.port || 80,
                path: url.pathname + url.search,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': bodyStr.length,
                    ...headers
                }
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        resolve({
                            status: res.statusCode,
                            headers: res.headers,
                            data: data,
                            json: data ? JSON.parse(data) : null
                        });
                    } catch (e) {
                        resolve({
                            status: res.statusCode,
                            headers: res.headers,
                            data: data,
                            json: null
                        });
                    }
                });
            });

            req.on('error', (err) => {
                console.error('Request error:', err.message);
                reject(err);
            });
            
            if (bodyStr) {
                req.write(bodyStr);
            }
            req.end();
        } catch (err) {
            reject(err);
        }
    });
}

async function runTests() {
    try {
        console.log('🧪 Testing Backup & Download System\n');
        console.log('=' .repeat(50));

        // Step 1: Login to get auth token
        console.log('\n1️⃣  Logging in...');
        const loginResp = await makeRequest('POST', '/api/auth/login', {}, {
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD
        });
        
        if (loginResp.status !== 200) {
            console.log(`❌ Login failed: ${loginResp.status}`);
            console.log('Response:', loginResp.data);
            return;
        }

        const token = loginResp.json?.token;
        if (!token) {
            console.log('❌ No token in response');
            console.log('Response:', loginResp.json);
            return;
        }

        console.log(`✅ Logged in, token: ${token.substring(0, 20)}...`);

        // Step 2: Trigger manual backup
        console.log('\n2️⃣  Creating database backup...');
        const backupResp = await makeRequest('POST', '/api/backups/manual', 
            { 'Authorization': `Bearer ${token}` },
            { type: 'database' }
        );

        if (backupResp.status !== 200) {
            console.log(`❌ Backup request failed: ${backupResp.status}`);
            console.log('Response:', backupResp.data);
            return;
        }

        console.log(`✅ Backup response:`, JSON.stringify(backupResp.json, null, 2));

        // Step 3: Get backup history
        console.log('\n3️⃣  Fetching backup history...');
        const historyResp = await makeRequest('GET', '/api/backups/history',
            { 'Authorization': `Bearer ${token}` }
        );

        if (historyResp.status !== 200) {
            console.log(`❌ History fetch failed: ${historyResp.status}`);
            console.log('Response:', historyResp.data);
            return;
        }

        const backups = historyResp.json?.data || [];
        console.log(`✅ Found ${backups.length} backups:`);
        backups.forEach(b => {
            console.log(`   - ${b.name} [${b.status}] (${b.size} bytes)`);
        });

        // Step 4: Download latest successful backup
        const successBackup = backups.find(b => b.status === 'success');
        if (!successBackup) {
            console.log('\n⚠️  No successful backups found, creating one...');
            
            // Wait a bit for backup to complete
            await new Promise(r => setTimeout(r, 2000));
            
            const newBackupResp = await makeRequest('POST', '/api/backups/manual',
                { 'Authorization': `Bearer ${token}` },
                { type: 'database' }
            );
            
            if (newBackupResp.json?.results?.database?.success) {
                console.log('✅ Backup created successfully');
                successBackup = {
                    name: newBackupResp.json.results.database.backupName,
                    type: 'database'
                };
            } else {
                console.log('❌ Could not create backup');
                return;
            }
        }

        console.log(`\n4️⃣  Downloading backup: ${successBackup.name}`);
        const downloadResp = await makeRequest('GET', 
            `/api/backups/download/${successBackup.name}?type=${successBackup.type}`,
            { 'Authorization': `Bearer ${token}` }
        );

        if (downloadResp.status === 200) {
            console.log(`✅ Download successful!`);
            console.log(`   Status: ${downloadResp.status}`);
            console.log(`   Size: ${downloadResp.data.length} bytes`);
            console.log(`   Content-Type: ${downloadResp.headers['content-type']}`);
            console.log(`   Preview: ${downloadResp.data.substring(0, 100)}...`);
        } else {
            console.log(`❌ Download failed: ${downloadResp.status}`);
            console.log('Response:', downloadResp.data);
        }

        console.log('\n' + '='.repeat(50));
        console.log('✅ Test completed!');

    } catch (error) {
        console.error('❌ Test error:', error.message);
    }

    process.exit(0);
}

// Run tests
runTests();
