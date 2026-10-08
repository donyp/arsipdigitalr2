#!/usr/bin/env node
/**
 * Get moderator user email
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
    console.log('\n=== GETTING MODERATOR EMAIL ===\n');

    try {
        // Get all auth users
        const { data: authUsers, error } = await supabase.auth.admin.listUsers();

        if (error) {
            console.error('❌ Error:', error.message);
            process.exit(1);
        }

        console.log('All Auth Users:');
        console.log('===============');
        authUsers.users.forEach(u => {
            console.log(`\nEmail: ${u.email}`);
            console.log(`ID: ${u.id}`);
            console.log(`Phone: ${u.phone || 'N/A'}`);
            console.log(`Confirmed at: ${u.confirmed_at || 'Not confirmed'}`);
        });

        // Also check users table
        console.log('\n\nUsers Table:');
        console.log('============');
        const { data: users } = await supabase
            .from('users')
            .select('id, username, email, role');

        users?.forEach(u => {
            console.log(`\nUsername: ${u.username}`);
            console.log(`Email: ${u.email}`);
            console.log(`Role: ${u.role}`);
            console.log(`ID: ${u.id}`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

test();
