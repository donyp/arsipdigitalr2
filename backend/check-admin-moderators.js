#!/usr/bin/env node
/**
 * Check how many super_admin and moderator users exist
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
    try {
        console.log('\n=== CHECKING ADMIN & MODERATOR USERS ===\n');

        // Get all users
        const { data: allUsers, error: allError } = await supabase
            .from('users')
            .select('id, email, name, role, is_active');

        if (allError) throw allError;

        console.log(`Total users in database: ${allUsers.length}`);

        // Get super_admin users
        const superAdmins = allUsers.filter(u => u.role === 'super_admin');
        console.log(`\n📊 Super Admin users: ${superAdmins.length}`);
        superAdmins.forEach((u, i) => {
            console.log(`   ${i+1}. ${u.name || u.email} (${u.email}) - Active: ${u.is_active}`);
        });

        // Get moderator users
        const moderators = allUsers.filter(u => u.role === 'moderator');
        console.log(`\n📊 Moderator users: ${moderators.length}`);
        moderators.forEach((u, i) => {
            console.log(`   ${i+1}. ${u.name || u.email} (${u.email}) - Active: ${u.is_active}`);
        });

        // Get active super_admin & moderator
        const activeAdmins = allUsers.filter(u => 
            (u.role === 'super_admin' || u.role === 'moderator') && u.is_active
        );

        console.log(`\n✅ Active Super Admin & Moderator: ${activeAdmins.length}`);
        activeAdmins.forEach((u, i) => {
            console.log(`   ${i+1}. ${u.name || u.email} (${u.email})`);
        });

        // Check tokens
        console.log('\n=== CHECKING TOKENS ===\n');
        const { data: tokens, error: tokenError } = await supabase
            .from('daily_login_tokens')
            .select('user_id, token, email_sent, email_address, created_at');

        if (tokenError) throw tokenError;

        console.log(`Total tokens in database: ${tokens.length}`);
        tokens.forEach((t, i) => {
            const user = allUsers.find(u => u.id === t.user_id);
            console.log(`   ${i+1}. ${user?.name || 'Unknown'} (${t.email_address}) - Sent: ${t.email_sent}`);
        });

        console.log('\n=== SUMMARY ===');
        console.log(`Active Admins: ${activeAdmins.length}`);
        console.log(`Tokens Generated: ${tokens.length}`);
        console.log(`Missing Tokens: ${activeAdmins.length - tokens.length}`);

    } catch (error) {
        console.error('Error:', error.message);
    }

    process.exit(0);
})();
