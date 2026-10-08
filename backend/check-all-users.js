#!/usr/bin/env node
/**
 * Check all users in auth.users and users table
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
    try {
        console.log('[CHECK] Getting all auth users...\n');
        
        // Get auth users
        const { data: authUsers, error } = await supabase.auth.admin.listUsers();
        
        if (error) {
            console.error('Error fetching auth users:', error);
            return;
        }

        console.log(`Total Auth Users: ${authUsers.users.length}\n`);
        console.log('=== AUTH USERS ===');
        authUsers.users.forEach((u, idx) => {
            console.log(`${idx + 1}. ID: ${u.id}`);
            console.log(`   Email: ${u.email}`);
            console.log(`   Name: ${u.user_metadata?.full_name || 'N/A'}`);
            console.log(`   Created: ${u.created_at}\n`);
        });

        // Get users in users table
        console.log('\n=== USERS TABLE ===');
        const { data: tableUsers, error: tableError } = await supabase
            .from('users')
            .select('id, email, nama_lengkap, role');

        if (tableError) {
            console.error('Error fetching users table:', tableError);
            return;
        }

        console.log(`Total Table Users: ${tableUsers.length}\n`);
        tableUsers.forEach((u, idx) => {
            console.log(`${idx + 1}. ID: ${u.id}`);
            console.log(`   Email: ${u.email}`);
            console.log(`   Name: ${u.nama_lengkap}`);
            console.log(`   Role: ${u.role}\n`);
        });

        // Check for mismatches
        const authIds = new Set(authUsers.users.map(u => u.id));
        const tableIds = new Set(tableUsers.map(u => u.id));

        console.log('\n=== ANALYSIS ===');
        console.log(`Auth Users: ${authIds.size}`);
        console.log(`Table Users: ${tableIds.size}`);

        const onlyInAuth = Array.from(authIds).filter(id => !tableIds.has(id));
        const onlyInTable = Array.from(tableIds).filter(id => !authIds.has(id));

        if (onlyInAuth.length > 0) {
            console.log(`\n⚠️ Users in auth.users but NOT in users table (${onlyInAuth.length}):`);
            onlyInAuth.forEach(id => {
                const user = authUsers.users.find(u => u.id === id);
                console.log(`  - ${id}: ${user.email}`);
            });
        }

        if (onlyInTable.length > 0) {
            console.log(`\n⚠️ Users in users table but NOT in auth.users (${onlyInTable.length}):`);
            onlyInTable.forEach(id => {
                const user = tableUsers.find(u => u.id === id);
                console.log(`  - ${id}: ${user.email}`);
            });
        }

        if (onlyInAuth.length === 0 && onlyInTable.length === 0) {
            console.log('\n✅ All users synced correctly');
        }

    } catch (error) {
        console.error('Error:', error);
    }
    process.exit(0);
})();
