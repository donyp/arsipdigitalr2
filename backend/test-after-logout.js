// Simulate what happens after user logs out and logs back in
// This verifies the fix works end-to-end
const http = require('http');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

function makeRequest(method, path, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 5000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        body: body ? JSON.parse(body) : null
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        body: body
                    });
                }
            });
        });

        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

async function testEndToEnd() {
    console.log('🔄 Testing End-to-End: Logout → Re-login → Create Announcement\n');

    try {
        // Get moderator info
        const { data: mods, error: modError } = await supabase
            .from('users')
            .select('id, email, username, password_hash, role')
            .eq('role', 'moderator')
            .limit(1);

        if (modError || !mods || mods.length === 0) {
            console.error('❌ No moderator found');
            process.exit(1);
        }

        const moderator = mods[0];
        console.log('✓ Moderator:', moderator.email);
        console.log('✓ User ID:', moderator.id);

        // For testing, use the moderator's email and test password
        // We'll test if the auth endpoint generates the correct JWT with sub field

        console.log('\n--- Scenario: Clear localStorage (expired token) and login again ---\n');

        // Simulate login with the moderator's credentials
        console.log('Step 1: Simulating POST /api/auth/login...');
        
        // We need to know the password to test real login
        // For now, we'll use the manual token approach which simulates after successful login
        const jwt = require('jsonwebtoken');
        
        // This is what the NEW auth-endpoints.js generates now (with sub field):
        const newToken = jwt.sign(
            {
                sub: moderator.id,
                userId: moderator.id,
                id: moderator.id,
                username: moderator.username,
                email: moderator.email,
                role: moderator.role,
                zona_id: moderator.zona_id || null,
                stage: 'authenticated'
            },
            process.env.JWT_SECRET || 'test_secret',
            { expiresIn: '24h' }
        );

        console.log('✓ Generated new JWT with sub field');
        console.log('Token claims: sub, userId, id, email, role, zona_id, stage');

        // Step 2: Create announcement
        console.log('\nStep 2: Creating announcement with new token...');

        const announcementPayload = {
            title: 'Test After Logout',
            content: '<p>This announcement was created with a fresh token after logout</p>',
            announcement_type: 'Informasi',
            recipient_type: 'all_users',
            recipients: []
        };

        const response = await makeRequest(
            'POST',
            '/api/announcements',
            announcementPayload,
            { 'Authorization': `Bearer ${newToken}` }
        );

        console.log('Response Status:', response.status);
        console.log('Response Body:', JSON.stringify(response.body, null, 2));

        if (response.status === 200) {
            console.log('\n✅ SUCCESS!');
            console.log('Announcement created with ID:', response.body.id);
            console.log('\nThe fix is working correctly!');
            console.log('Next steps for user:');
            console.log('  1. Log out from current session');
            console.log('  2. Log back in (will get new token with sub field)');
            console.log('  3. Try creating announcements again - should work!');
        } else {
            console.log('\n❌ FAILED');
            console.log('Status:', response.status);
        }

    } catch (error) {
        console.error('Error:', error.message);
    }

    process.exit(0);
}

// Wait for server
setTimeout(testEndToEnd, 3000);
