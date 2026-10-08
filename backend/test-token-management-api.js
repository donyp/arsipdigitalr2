#!/usr/bin/env node
/**
 * Test script for Token Management API endpoints
 * Tests /api/auth/daily-tokens endpoint with proper JWT
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
    try {
        console.log('\n=== Token Management API Test ===\n');

        // Get a test user
        console.log('1. Fetching test user (moderator)...');
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('id, email, name, role')
            .eq('role', 'moderator')
            .limit(1);

        if (userError || !users || users.length === 0) {
            console.error('❌ No moderator user found');
            return;
        }

        const testUser = users[0];
        console.log(`✅ Found: ${testUser.email} (${testUser.role})`);

        // Generate a test JWT token
        console.log('\n2. Generating test JWT token...');
        const token = jwt.sign(
            {
                userId: testUser.id,
                email: testUser.email,
                role: testUser.role,
                name: testUser.name
            },
            process.env.JWT_SECRET || 'test-secret-key',
            { expiresIn: '24h' }
        );
        console.log(`✅ Token generated (expires in 24h)`);

        // Test the API endpoints
        console.log('\n3. Testing /api/auth/daily-tokens endpoint...');
        const response = await fetch('http://localhost:5000/api/auth/daily-tokens', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error(`❌ API Error (${response.status}):`, errorData);
            return;
        }

        const data = await response.json();
        console.log(`✅ API Response received`);
        console.log(`   Total tokens: ${data.count}`);
        
        if (data.tokens && data.tokens.length > 0) {
            console.log(`   First token:`, {
                userId: data.tokens[0].userId,
                email: data.tokens[0].email,
                created: data.tokens[0].createdAt,
                status: data.tokens[0].emailSent ? 'Sent' : 'Not sent'
            });
        } else {
            console.log(`   ℹ️  No tokens yet (will be generated at 04:00 UTC)`);
        }

        console.log('\n4. Testing /api/auth/token-stats endpoint...');
        const statsResponse = await fetch('http://localhost:5000/api/auth/token-stats', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!statsResponse.ok) {
            const errorData = await statsResponse.text();
            console.error(`❌ Stats API Error (${statsResponse.status}):`, errorData);
        } else {
            const statsData = await statsResponse.json();
            console.log(`✅ Stats API Response received`);
            if (statsData.stats) {
                console.log(`   Generated today: ${statsData.stats.totalGenerated}`);
                console.log(`   Sent: ${statsData.stats.totalSent}`);
                console.log(`   Failed: ${statsData.stats.emailFailed}`);
            }
        }

        console.log('\n=== All Tests Completed ✅ ===\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
    
    process.exit(0);
})();
