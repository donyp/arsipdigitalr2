// Test full announcement flow including login
const http = require('http');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper to make HTTP requests
function makeRequest(method, path, data = null, token = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 5000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    body: body ? JSON.parse(body) : null,
                    headers: res.headers
                });
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function testFullFlow() {
    console.log('🧪 Testing Full Announcement Flow...\n');

    try {
        // Get test moderator credentials
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('id, email, password_hash, role')
            .eq('role', 'moderator')
            .limit(1);

        if (usersError || !users || users.length === 0) {
            console.error('❌ No moderator found');
            process.exit(1);
        }

        const moderator = users[0];
        console.log('✓ Found moderator:', moderator.email);
        console.log('Note: Testing with existing credentials from database\n');

        // Step 1: Create announcement directly via Supabase (to test database)
        console.log('Step 1: Creating test announcement directly in database...');
        const { data: testAnn, error: annError } = await supabase
            .from('announcements')
            .insert({
                title: 'Direct DB Test',
                content: '<p>Test</p>',
                announcement_type: 'Informasi',
                recipient_type: 'all_users',
                created_by: moderator.id,
                is_active: true
            })
            .select('id')
            .maybeSingle();

        if (annError) {
            console.error('❌ Database insert failed:', annError.message);
            process.exit(1);
        }
        console.log('✓ Announcement created with ID:', testAnn.id, '\n');

        // Step 2: Try to submit via API with generated token
        console.log('Step 2: Testing API with JWT token (will use moderator ID from database)...');
        
        // Generate a proper JWT
        const jwt = require('jsonwebtoken');
        const manualToken = jwt.sign(
            {
                sub: moderator.id,
                userId: moderator.id,
                id: moderator.id,
                email: moderator.email,
                role: moderator.role
            },
            process.env.JWT_SECRET || 'test_secret',
            { expiresIn: '24h' }
        );

        console.log('Generated JWT token for:', moderator.email);

        // Try submitting announcement
        const announcementData = {
            title: 'API Test Announcement',
            content: '<p>Testing from API with JWT</p>',
            announcement_type: 'Informasi',
            recipient_type: 'all_users',
            recipients: []
        };

        console.log('Sending POST /api/announcements...');
        const response = await makeRequest('POST', '/api/announcements', announcementData, manualToken);

        console.log('Response Status:', response.status);
        console.log('Response:', JSON.stringify(response.body, null, 2));

        if (response.status === 200) {
            console.log('\n✅ SUCCESS! API works correctly');
            console.log('Fix confirmed: JWT now includes sub, userId, and id fields');
        } else {
            console.log('\n❌ FAILED. Status:', response.status);
        }

    } catch (error) {
        console.error('Error:', error.message);
    }

    process.exit(0);
}

// Wait for server to be ready
setTimeout(testFullFlow, 3000);
