#!/usr/bin/env node
/**
 * Direct test: Generate tokens and check database
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
    console.log('\n=== TESTING TOKEN GENERATION DIRECTLY ===\n');

    try {
        // Get users from auth.users (Supabase auth)
        console.log('1️⃣  Getting users from auth.users...');
        const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();

        if (authError || !authUsers || authUsers.users.length === 0) {
            console.error('❌ No auth users found:', authError);
            process.exit(1);
        }

        console.log(`   ✅ Found ${authUsers.users.length} auth users`);
        
        // Filter users with emails
        const validUsers = authUsers.users.filter(u => u.email);
        console.log(`   ✅ ${validUsers.length} users with emails`);
        validUsers.slice(0, 3).forEach(u => console.log(`      - ${u.email} (${u.id})`));

        // Generate token for first user
        const testUser = validUsers[0];
        console.log(`\n2️⃣  Generating token for user: ${testUser.email}`);

        const generateToken = () => {
            return Math.floor(10000 + Math.random() * 90000).toString();
        };

        const token = generateToken();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        console.log(`   Token: ${token}`);
        console.log(`   User ID (UUID): ${testUser.id}`);
        console.log(`   Expires at: ${expiresAt.toISOString()}`);

        // Insert token into database
        console.log(`\n3️⃣  Inserting token into database...`);
        const { data: insertResult, error: insertError } = await supabase
            .from('daily_login_tokens')
            .insert({
                user_id: testUser.id,
                token,
                expires_at: expiresAt.toISOString(),
                email_address: testUser.email,
                email_sent: false,
                token_attempts: 0,
                is_locked: false
            })
            .select();

        if (insertError) {
            console.error('❌ Insert error:', insertError.message);
            console.error('Full error:', insertError);
            process.exit(1);
        }

        console.log('   ✅ Token inserted successfully');
        console.log('   ID:', insertResult[0].id);
        console.log('   Created at:', insertResult[0].created_at);

        // Query back to verify
        console.log(`\n4️⃣  Verifying token in database...`);
        const { data: verifyResult, error: verifyError } = await supabase
            .from('daily_login_tokens')
            .select('*')
            .eq('token', token)
            .single();

        if (verifyError) {
            console.error('❌ Verify error:', verifyError.message);
            process.exit(1);
        }

        console.log('   ✅ Token verified in database');
        console.log('   Token:', verifyResult.token);
        console.log('   User ID:', verifyResult.user_id);
        console.log('   Expires at:', verifyResult.expires_at);
        console.log('   Email sent:', verifyResult.email_sent);

        console.log('\n✅ ALL TESTS PASSED!\n');
        console.log('Summary:');
        console.log(`  - Token generated: ${token}`);
        console.log(`  - User: ${testUser.email}`);
        console.log(`  - User UUID: ${testUser.id}`);
        console.log(`  - Database insertion: SUCCESS`);
        console.log('\nNext step: Test Resend email sending\n');

        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
        process.exit(1);
    }
}

test();
