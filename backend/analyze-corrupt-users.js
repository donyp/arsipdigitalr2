#!/usr/bin/env node
/**
 * Analyze which users are corrupt and cannot generate tokens
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
    try {
        console.log('[ANALYZE] Checking for corrupt users...\n');

        // Get all users
        const { data: allUsers } = await supabase
            .from('users')
            .select('id, email, name, role, is_active');

        console.log(`Total users in table: ${allUsers.length}\n`);

        // Test each user by trying to create a dummy token
        const corruptUsers = [];
        const validUsers = [];

        console.log('Testing each user...\n');

        for (const user of allUsers) {
            const testToken = Math.floor(10000 + Math.random() * 90000).toString();
            
            const { error } = await supabase
                .from('daily_login_tokens')
                .insert({
                    user_id: user.id,
                    token: testToken,
                    expires_at: new Date(Date.now() + 86400000).toISOString(),
                    email_address: user.email
                });

            if (error) {
                if (error.message.includes('violates foreign key constraint')) {
                    corruptUsers.push({
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        role: user.role,
                        error: 'FK Constraint Violation'
                    });
                } else {
                    corruptUsers.push({
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        role: user.role,
                        error: error.message
                    });
                }
            } else {
                validUsers.push({
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    status: 'Valid - Can generate tokens'
                });
                
                // Clean up test token
                await supabase
                    .from('daily_login_tokens')
                    .delete()
                    .eq('token', testToken);
            }
        }

        console.log('=== VALID USERS (Can generate tokens) ===\n');
        validUsers.forEach((u, idx) => {
            console.log(`${idx + 1}. ${u.name} (${u.role})`);
            console.log(`   ID: ${u.id}`);
            console.log(`   Email: ${u.email}\n`);
        });

        console.log('\n=== CORRUPT USERS (Cannot generate tokens) ===\n');
        corruptUsers.forEach((u, idx) => {
            console.log(`${idx + 1}. ${u.name} (${u.role})`);
            console.log(`   ID: ${u.id}`);
            console.log(`   Email: ${u.email}`);
            console.log(`   Error: ${u.error}\n`);
        });

        console.log('\n=== SUMMARY ===');
        console.log(`✅ Valid users: ${validUsers.length}`);
        console.log(`❌ Corrupt users: ${corruptUsers.length}`);
        console.log(`📊 Success rate: ${(validUsers.length / allUsers.length * 100).toFixed(1)}%`);

        console.log('\n=== SOLUTION ===');
        console.log('These corrupt users need to be deleted or fixed:');
        console.log('\nSQL to DELETE corrupt users:');
        console.log(`\nDELETE FROM users WHERE id IN (`);
        corruptUsers.forEach((u, idx) => {
            const comma = idx === corruptUsers.length - 1 ? '' : ',';
            console.log(`  '${u.id}'${comma}`);
        });
        console.log(`);`);

        console.log('\n\nOr use this safer query (with verification):');
        console.log(`\nSELECT * FROM users WHERE id IN (`);
        corruptUsers.forEach((u, idx) => {
            const comma = idx === corruptUsers.length - 1 ? '' : ',';
            console.log(`  '${u.id}'${comma}`);
        });
        console.log(`);`);

    } catch (error) {
        console.error('[ANALYZE] ❌ Error:', error);
    }
    
    process.exit(0);
})();
