#!/usr/bin/env node
/**
 * Check what's wrong with Asep's user ID
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
    try {
        console.log('\n=== CHECKING ASEP USER ===\n');

        // Get Asep from users table
        const { data: asep } = await supabase
            .from('users')
            .select('*')
            .eq('email', 'tes@gmail.com');

        if (asep && asep.length > 0) {
            const user = asep[0];
            console.log('Found Asep in users table:');
            console.log(`  ID: ${user.id}`);
            console.log(`  Email: ${user.email}`);
            console.log(`  Name: ${user.name}`);
            console.log(`  Role: ${user.role}`);
            console.log(`  Is Active: ${user.is_active}`);
            console.log('');

            // Try to insert a token for Asep
            console.log('Attempting to create token for Asep...');
            const { error, data } = await supabase
                .from('daily_login_tokens')
                .insert({
                    user_id: user.id,
                    token: '99999',
                    email_address: user.email,
                    created_at: new Date().toISOString(),
                    expires_at: new Date(Date.now() + 24*60*60*1000).toISOString()
                });

            if (error) {
                console.log('❌ ERROR inserting token:');
                console.log(`  Code: ${error.code}`);
                console.log(`  Message: ${error.message}`);
                console.log(`  Details: ${error.details}`);
            } else {
                console.log('✅ Token inserted successfully!');
            }
        } else {
            console.log('❌ Asep not found in users table!');
        }

    } catch (error) {
        console.error('Error:', error);
    }

    process.exit(0);
})();
