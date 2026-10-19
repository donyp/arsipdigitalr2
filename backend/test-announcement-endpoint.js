// Test announcement endpoint
const http = require('http');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function generateToken(userId, role) {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
        { id: userId, role, email: 'test@test.com' },
        process.env.JWT_SECRET || 'test_secret',
        { expiresIn: '24h' }
    );
}

async function testEndpoint() {
    console.log('Testing POST /api/announcements endpoint...\n');

    try {
        // Get a moderator user
        const { data: moderator, error: modError } = await supabase
            .from('users')
            .select('id, email, role')
            .eq('role', 'moderator')
            .limit(1)
            .maybeSingle();

        if (modError || !moderator) {
            console.error('Error fetching moderator:', modError?.message || 'No moderator found');
            return;
        }

        console.log('✓ Using moderator:', moderator.email);

        // Generate token with proper payload
        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
            { sub: moderator.id, id: moderator.id, userId: moderator.id, role: moderator.role, email: moderator.email },
            process.env.JWT_SECRET || 'test_secret',
            { expiresIn: '24h' }
        );
        console.log('✓ Token generated');

        // Prepare payload
        const payload = {
            title: 'Test Announcement from Endpoint',
            content: '<p>This is a test announcement from endpoint</p>',
            announcement_type: 'Informasi',
            recipient_type: 'all_users',
            recipients: []
        };

        console.log('\nPayload:', JSON.stringify(payload, null, 2));

        // Make request
        const options = {
            hostname: 'localhost',
            port: 5000,
            path: '/api/announcements',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        };

        const request = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                console.log('\n✓ Response Status:', res.statusCode);
                console.log('Response Headers:', res.headers);
                console.log('Response Body:', data);

                if (res.statusCode === 200) {
                    console.log('\n✅ SUCCESS');
                } else {
                    console.log('\n❌ FAILED');
                }

                process.exit(0);
            });
        });

        request.on('error', (e) => {
            console.error('❌ Request error:', e.message);
            process.exit(1);
        });

        request.write(JSON.stringify(payload));
        request.end();

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

// Wait a bit for server to start
setTimeout(testEndpoint, 2000);
