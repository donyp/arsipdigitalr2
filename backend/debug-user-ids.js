#!/usr/bin/env node
/**
 * Debug: Check user IDs in users table vs what we're trying to use
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
    try {
        console.log('[DEBUG] Checking user IDs in users table...\n');

        const { data: users, error } = await supabase
            .from('users')
            .select('id, email, name, role, is_active')
            .eq('is_active', true);

        if (error) {
            console.error('Error:', error);
            process.exit(1);
        }

        console.log(`Found ${users.length} active users:\n`);
        users.forEach((u, idx) => {
            console.log(`${idx + 1}. ID: ${u.id}`);
            console.log(`   Email: ${u.email}`);
            console.log(`   Name: ${u.name}`);
            console.log(`   Role: ${u.role}\n`);
        });

        // Now try to insert a token with the correct ID
        console.log('=== Testing Token Creation ===\n');
        
        for (const user of users) {
            console.log(`Testing user: ${user.name} (${user.id})`);
            
            const { data, error: insertError } = await supabase
                .from('daily_login_tokens')
                .insert({
                    user_id: user.id,
                    token: Math.floor(10000 + Math.random() * 90000).toString(),
                    expires_at: new Date(Date.now() + 86400000).toISOString(),
                    email_address: user.email,
                    email_sent: false
                })
                .select();

            if (insertError) {
                console.log(`  ❌ Error: ${insertError.message}`);
            } else {
                console.log(`  ✅ Success: Token ${data[0].token} created`);
                // Delete for cleanup
                await supabase
                    .from('daily_login_tokens')
                    .delete()
                    .eq('id', data[0].id);
            }
        }

    } catch (error) {
        console.error('[DEBUG] ❌ Error:', error);
    }
    
    process.exit(0);
})();
