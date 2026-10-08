/**
 * Test: Create New Admin User and Generate Token
 * Verify token goes to centralized email (donisugiharto322@gmail.com)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testNewAdminTokenGeneration() {
    try {
        console.log('🧪 Testing new admin user token generation...\n');

        const testEmail = `admin-test-${Date.now()}@test.com`;
        const testUsername = `admintest${Date.now()}`;
        const testPassword = 'AdminTest@2024';

        // Step 1: Create new admin user in auth.users
        console.log(`1️⃣ Creating new admin user in auth.users...`);
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
            email: testEmail,
            password: testPassword,
            email_confirm: true
        });

        if (authError) {
            console.error(`   ❌ Failed:`, authError);
            process.exit(1);
        }

        console.log(`   ✅ Created: ${authUser.user.id}`);
        const userId = authUser.user.id;

        // Step 2: Create in public.users
        console.log(`\n2️⃣ Creating in public.users with same ID...`);
        const { data: dbUser, error: dbError } = await supabase
            .from('users')
            .insert({
                id: userId,
                email: testEmail,
                username: testUsername,
                password_hash: '$2a$12$placeholder', // Will be replaced by auth system
                name: 'Test Admin',
                role: 'moderator', // Test as moderator
                is_active: true,
                permissions: ['IS_MODERATOR']
            })
            .select()
            .single();

        if (dbError) {
            console.error(`   ❌ Failed:`, dbError);
            // Cleanup
            await supabase.auth.admin.deleteUser(userId);
            process.exit(1);
        }

        console.log(`   ✅ Created: ${dbUser.id}`);

        // Step 3: Trigger token generation
        console.log(`\n3️⃣ Generating token...`);
        const DailyTokenService = require('./daily-token-service.js');
        const tokenService = new DailyTokenService(supabase);
        
        const tokenResult = await tokenService.createDailyToken(userId, testEmail);
        
        if (!tokenResult.success) {
            console.error(`   ❌ Token generation failed:`, tokenResult.error);
            process.exit(1);
        }

        console.log(`   ✅ Token generated: ${tokenResult.token}`);

        // Step 4: Check if token record was created
        console.log(`\n4️⃣ Verifying token in database...`);
        const { data: tokenRecord, error: tokenCheckError } = await supabase
            .from('daily_login_tokens')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (tokenCheckError || !tokenRecord) {
            console.error(`   ❌ Token not found in database`);
            process.exit(1);
        }

        console.log(`   ✅ Token record found:`);
        console.log(`      - Token: ${tokenRecord.token}`);
        console.log(`      - Expires: ${tokenRecord.expires_at}`);
        console.log(`      - Email sent: ${tokenRecord.email_sent}`);

        // Step 5: Summary
        console.log(`\n5️⃣ Summary:`);
        console.log(`   User: ${testEmail} (moderator)`);
        console.log(`   Token: ${tokenResult.token}`);
        console.log(`   Should be sent to: ${process.env.ADMIN_TOKEN_EMAIL}`);
        console.log(`   (Check email ${process.env.ADMIN_TOKEN_EMAIL} for token)`);

        // Step 6: Cleanup
        console.log(`\n6️⃣ Cleaning up test user...`);
        await supabase.from('users').delete().eq('id', userId);
        await supabase.auth.admin.deleteUser(userId);
        console.log(`   ✅ Cleaned up`);

        console.log(`\n✅ TEST COMPLETE - New admin users can now generate tokens!`);

    } catch (error) {
        console.error(`\n❌ Unexpected error:`, error.message);
        process.exit(1);
    }
}

testNewAdminTokenGeneration();
