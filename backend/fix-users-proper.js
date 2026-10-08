#!/usr/bin/env node
/**
 * Fix: Ensure users are properly created in public schema
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
    try {
        console.log('\n=== VERIFYING USERS IN DATABASE ===\n');

        // Get all users
        const { data: users, error } = await supabase
            .from('users')
            .select('id, email, name, role, is_active')
            .in('role', ['super_admin', 'moderator', 'admin_zona']);

        if (error) {
            console.error('Error fetching users:', error);
            process.exit(1);
        }

        console.log(`Found ${users.length} admin users:`);
        users.forEach((u, i) => {
            console.log(`${i+1}. ${u.name} (${u.email})`);
            console.log(`   ID: ${u.id}`);
            console.log(`   Role: ${u.role}`);
            console.log(`   Active: ${u.is_active}`);
        });

        // Verify FK constraint - try manual insert
        console.log('\n=== TESTING FK CONSTRAINT ===\n');
        
        if (users.length > 0) {
            const testUser = users[0];
            console.log(`Testing with user: ${testUser.name} (${testUser.id})`);

            // Try to insert a test token
            const { error: insertError, data } = await supabase
                .from('daily_login_tokens')
                .insert({
                    user_id: testUser.id,
                    token: '88888',
                    email_address: testUser.email,
                    created_at: new Date().toISOString(),
                    expires_at: new Date(Date.now() + 24*60*60*1000).toISOString(),
                    email_sent: false
                });

            if (insertError) {
                console.error('❌ FK CONSTRAINT ERROR:');
                console.error(`   Code: ${insertError.code}`);
                console.error(`   Message: ${insertError.message}`);
                console.error(`   Details: ${insertError.details}`);
                console.error('\nPOSSIBLE CAUSES:');
                console.error('1. User ID format is wrong');
                console.error('2. FK references wrong schema');
                console.error('3. Table permissions issue');
            } else {
                console.log('✅ Token inserted successfully!');
                console.log(`   Token ID: ${data[0]?.id}`);

                // Clean up test token
                await supabase.from('daily_login_tokens').delete().eq('token', '88888');
            }
        }

    } catch (error) {
        console.error('Error:', error);
    }

    process.exit(0);
})();
