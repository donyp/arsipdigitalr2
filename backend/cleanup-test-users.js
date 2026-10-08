#!/usr/bin/env node
/**
 * Cleanup: Delete test users and their tokens
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
    try {
        console.log('\n=== CLEANUP: DELETE TEST USERS ===\n');

        // Step 1: Delete Admin Arsip
        console.log('Step 1: Deleting test user "Admin Arsip"...');
        const { error: adminError } = await supabase
            .from('users')
            .delete()
            .eq('email', 'admin@arsipdigitalanka.my.id');

        if (adminError) {
            console.error('Error:', adminError);
        } else {
            console.log('✅ Admin Arsip deleted');
        }

        // Step 2: Delete Moderator Arsip
        console.log('\nStep 2: Deleting test user "Moderator Arsip"...');
        const { error: modError } = await supabase
            .from('users')
            .delete()
            .eq('email', 'moderator@arsipdigitalanka.my.id');

        if (modError) {
            console.error('Error:', modError);
        } else {
            console.log('✅ Moderator Arsip deleted');
        }

        // Step 3: Delete their tokens
        console.log('\nStep 3: Deleting tokens for test users...');
        const { error: tokenError } = await supabase
            .from('daily_login_tokens')
            .delete()
            .in('email_address', ['admin@arsipdigitalanka.my.id', 'moderator@arsipdigitalanka.my.id']);

        if (tokenError) {
            console.log('Note:', tokenError.message);
        } else {
            console.log('✅ Tokens deleted');
        }

        // Step 4: Verify remaining users
        console.log('\n=== REMAINING USERS ===\n');
        const { data: remainingUsers } = await supabase
            .from('users')
            .select('id, email, name, role, is_active')
            .in('role', ['super_admin', 'moderator']);

        console.log(`Total Admin/Moderator users: ${remainingUsers.length}`);
        remainingUsers.forEach((u, i) => {
            console.log(`${i+1}. ${u.name} (${u.email}) - ${u.role}`);
        });

        console.log('\n✅ Cleanup complete!');
        console.log('Now only real users remain: Doni');

    } catch (error) {
        console.error('Error:', error);
    }

    process.exit(0);
})();
