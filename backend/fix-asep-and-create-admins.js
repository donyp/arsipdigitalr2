#!/usr/bin/env node
/**
 * Fix: Delete corrupt Asep user and create proper admin users
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
    try {
        console.log('\n=== FIX: DELETE CORRUPT USER & CREATE NEW ADMINS ===\n');

        // Step 1: Delete Asep
        console.log('Step 1: Deleting corrupt user Asep...');
        const { error: deleteError } = await supabase
            .from('users')
            .delete()
            .eq('email', 'tes@gmail.com');

        if (deleteError) {
            console.error('Error deleting Asep:', deleteError);
        } else {
            console.log('✅ Asep deleted');
        }

        // Step 2: Delete related tokens
        console.log('\nStep 2: Deleting tokens for Asep...');
        const { error: tokenDeleteError } = await supabase
            .from('daily_login_tokens')
            .delete()
            .eq('email_address', 'tes@gmail.com');

        if (tokenDeleteError) {
            console.log('Note:', tokenDeleteError.message);
        } else {
            console.log('✅ Tokens deleted');
        }

        // Step 3: Create new Super Admin user
        console.log('\nStep 3: Creating new Super Admin user...');
        const superAdminId = crypto.randomUUID();
        const { data: newSuperAdmin, error: superAdminError } = await supabase
            .from('users')
            .insert([{
                id: superAdminId,
                email: 'admin@arsipdigitalanka.my.id',
                name: 'Admin Arsip',
                role: 'super_admin',
                is_active: true,
                password_hash: 'dummy' // Will be set via auth
            }])
            .select();

        if (superAdminError) {
            console.error('Error creating super admin:', superAdminError);
        } else {
            console.log(`✅ Super Admin created: ${newSuperAdmin[0]?.email}`);
        }

        // Step 4: Create new Moderator user
        console.log('\nStep 4: Creating new Moderator user...');
        const moderatorId = crypto.randomUUID();
        const { data: newModerator, error: moderatorError } = await supabase
            .from('users')
            .insert([{
                id: moderatorId,
                email: 'moderator@arsipdigitalanka.my.id',
                name: 'Moderator Arsip',
                role: 'moderator',
                is_active: true,
                password_hash: 'dummy'
            }])
            .select();

        if (moderatorError) {
            console.error('Error creating moderator:', moderatorError);
        } else {
            console.log(`✅ Moderator created: ${newModerator[0]?.email}`);
        }

        // Step 5: Verify users can now receive tokens
        console.log('\nStep 5: Verifying users...');
        const { data: allUsers } = await supabase
            .from('users')
            .select('id, email, name, role, is_active')
            .in('role', ['super_admin', 'moderator']);

        console.log(`\nTotal Admin/Moderator users now: ${allUsers.length}`);
        allUsers.forEach((u, i) => {
            console.log(`  ${i+1}. ${u.name} (${u.email}) - ${u.role}`);
        });

        console.log('\n=== READY FOR TOKEN GENERATION ===');
        console.log('Now run: node backend/test-token-generation-final.js');

    } catch (error) {
        console.error('Error:', error);
    }

    process.exit(0);
})();
