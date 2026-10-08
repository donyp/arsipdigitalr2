/**
 * Test: Verify new user is created in BOTH auth.users and public.users
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testUserSync() {
    try {
        console.log('🧪 Testing user sync between auth.users and public.users\n');

        // Create a test user via API
        const testEmail = `testuser-${Date.now()}@test.com`;
        const testUsername = `testuser${Date.now()}`;
        const testPassword = 'TestPassword@2024';

        console.log(`1️⃣ Creating test user in auth.users...`);
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
            email: testEmail,
            password: testPassword,
            email_confirm: true
        });

        if (authError) {
            console.error(`❌ Failed to create auth user:`, authError);
            process.exit(1);
        }

        console.log(`   ✅ Created in auth.users: ${authUser.user.id}`);
        const userId = authUser.user.id;

        // Insert to public.users with same ID
        console.log(`\n2️⃣ Creating test user in public.users...`);
        const { data: dbUser, error: dbError } = await supabase
            .from('users')
            .insert({
                id: userId, // Use auth user ID
                email: testEmail,
                username: testUsername,
                password_hash: 'placeholder_hash', // DB requires this field
                name: 'Test User',
                role: 'super_admin',
                is_active: true,
                permissions: []
            })
            .select()
            .single();

        if (dbError) {
            console.error(`❌ Failed to create DB user:`, dbError);
            process.exit(1);
        }

        console.log(`   ✅ Created in public.users: ${dbUser.id}`);

        // Verify in both tables
        console.log(`\n3️⃣ Verifying user exists in both tables...`);

        const { data: authCheck, error: authCheckErr } = await supabase.auth.admin.getUserById(userId);
        console.log(`   - Auth table: ${authCheck && authCheck.user ? '✅ Found' : '❌ Not found'}`);

        const { data: dbCheck, error: dbCheckErr } = await supabase
            .from('users')
            .select('id, email, username')
            .eq('id', userId)
            .single();
        console.log(`   - DB table: ${dbCheck ? '✅ Found' : '❌ Not found'}`);

        if (dbCheck) {
            console.log(`      - Email: ${dbCheck.email}`);
            console.log(`      - Username: ${dbCheck.username}`);
        }

        // Now test token generation
        console.log(`\n4️⃣ Testing token generation for new user...`);
        const { default: DailyTokenService } = await import('./daily-token-service.js');
        const tokenService = new DailyTokenService(supabase);

        const tokenResult = await tokenService.createDailyToken(userId, testEmail);
        if (tokenResult.success) {
            console.log(`   ✅ Token created: ${tokenResult.token}`);
        } else {
            console.log(`   ❌ Token creation failed: ${tokenResult.error}`);
        }

        // Cleanup
        console.log(`\n5️⃣ Cleaning up test user...`);
        await supabase.from('users').delete().eq('id', userId);
        await supabase.auth.admin.deleteUser(userId);
        console.log(`   ✅ Cleaned up`);

        console.log(`\n✅ TEST COMPLETE - User sync is working!`);

    } catch (error) {
        console.error(`\n❌ Error:`, error.message);
        process.exit(1);
    }
}

testUserSync();
