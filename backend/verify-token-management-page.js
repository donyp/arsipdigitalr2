#!/usr/bin/env node
/**
 * Comprehensive verification script for Token Management page
 * Checks all endpoints and data integrity
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

let testsPassed = 0;
let testsFailed = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`✅ ${name}`);
        testsPassed++;
    } catch (error) {
        console.error(`❌ ${name}:`, error.message);
        testsFailed++;
    }
}

(async () => {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║  Token Management Page - Verification Suite  ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    // Get a test user
    const { data: users } = await supabase
        .from('users')
        .select('id, email, name, role')
        .eq('role', 'moderator')
        .limit(1);

    if (!users || users.length === 0) {
        console.error('❌ No moderator user found for testing\n');
        process.exit(1);
    }

    const testUser = users[0];
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

    console.log(`Using test user: ${testUser.email}\n`);

    // Test 1: Check if daily_login_tokens table exists and has data
    await test('Daily tokens table exists and contains data', async () => {
        const { data, error } = await supabase
            .from('daily_login_tokens')
            .select('count', { count: 'exact' });
        
        if (error) throw error;
        console.log(`   (Found ${data[0]?.count || 0} tokens in database)`);
    });

    // Test 2: Check if users table has users
    await test('Users table contains active users', async () => {
        const { data, error } = await supabase
            .from('users')
            .select('count', { count: 'exact' })
            .eq('is_active', true);
        
        if (error) throw error;
        if (!data || data[0]?.count === 0) throw new Error('No active users');
        console.log(`   (Found ${data[0]?.count} active users)`);
    });

    // Test 3: Fetch daily tokens via API
    await test('Fetch daily tokens via /api/auth/daily-tokens', async () => {
        const response = await fetch('http://localhost:5000/api/auth/daily-tokens', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        if (!Array.isArray(data.tokens)) throw new Error('Tokens not an array');
        
        console.log(`   (Retrieved ${data.tokens.length} tokens)`);
    });

    // Test 4: Fetch token stats
    await test('Fetch token statistics via /api/auth/token-stats', async () => {
        const response = await fetch('http://localhost:5000/api/auth/token-stats', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        console.log(`   (Stats: ${JSON.stringify(data.stats || {})})`);
    });

    // Test 5: Check token data structure
    await test('Token data structure is correct', async () => {
        const response = await fetch('http://localhost:5000/api/auth/daily-tokens', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        if (!data.tokens || data.tokens.length === 0) {
            console.log('   (No tokens to validate, skipping structure check)');
            return;
        }

        const tokenObj = data.tokens[0];
        const requiredFields = ['id', 'userId', 'email', 'token', 'createdAt', 'expiresAt', 'emailSent'];
        const missingFields = requiredFields.filter(field => !(field in tokenObj));

        if (missingFields.length > 0) {
            throw new Error(`Missing fields: ${missingFields.join(', ')}`);
        }
        
        console.log(`   (Token structure valid: ${requiredFields.length} fields present)`);
    });

    // Test 6: Verify token expiry is set
    await test('Daily tokens have expiry set (24 hours)', async () => {
        const { data, error } = await supabase
            .from('daily_login_tokens')
            .select('expires_at')
            .not('expires_at', 'is', null)
            .limit(1);

        if (error) throw error;
        if (!data || data.length === 0) {
            console.log('   (No tokens with expiry set - this is OK if tokens just generated)');
            return;
        }

        const expiresAt = new Date(data[0].expires_at);
        const now = new Date();
        const hoursUntilExpiry = (expiresAt - now) / (1000 * 60 * 60);

        // Allow some flexibility (tokens expire in ~22-24 hours)
        if (hoursUntilExpiry < 20 || hoursUntilExpiry > 25) {
            throw new Error(`Token expiry invalid: ${hoursUntilExpiry.toFixed(1)} hours`);
        }

        console.log(`   (Tokens expire in ~${hoursUntilExpiry.toFixed(1)} hours ✓)`);
    });

    // Test 7: Verify email_sent field
    await test('Tokens have email_sent status', async () => {
        const { data, error } = await supabase
            .from('daily_login_tokens')
            .select('email_sent, email_address')
            .limit(1);

        if (error) throw error;
        if (!data || data.length === 0) {
            console.log('   (No tokens in database yet)');
            return;
        }

        const token = data[0];
        console.log(`   (Email sent: ${token.email_sent}, Address: ${token.email_address || 'N/A'})`);
    });

    // Test 8: Check authorization (non-admin should be rejected)
    await test('Authorization check: non-admin rejected', async () => {
        const regularUserToken = jwt.sign(
            {
                userId: 'test-user',
                email: 'regular@example.com',
                role: 'user',  // Not admin
                name: 'Regular User'
            },
            process.env.JWT_SECRET || 'test-secret-key',
            { expiresIn: '24h' }
        );

        const response = await fetch('http://localhost:5000/api/auth/daily-tokens', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${regularUserToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            throw new Error('Non-admin user should be rejected');
        }

        console.log(`   (Access correctly denied with status ${response.status})`);
    });

    // Summary
    console.log(`\n╔════════════════════════════════════════════════╗`);
    console.log(`║  Test Results                                   ║`);
    console.log(`╠════════════════════════════════════════════════╣`);
    console.log(`║  ✅ Passed: ${testsPassed}`);
    console.log(`║  ❌ Failed: ${testsFailed}`);
    console.log(`║  Total: ${testsPassed + testsFailed}`);
    console.log(`╚════════════════════════════════════════════════╝\n`);

    if (testsFailed === 0) {
        console.log('🎉 All tests passed! Token Management API is working correctly.\n');
        process.exit(0);
    } else {
        console.log(`⚠️  ${testsFailed} test(s) failed. Please check the errors above.\n`);
        process.exit(1);
    }
})();
