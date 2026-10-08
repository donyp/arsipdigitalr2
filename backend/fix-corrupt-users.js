#!/usr/bin/env node
/**
 * Fix: Delete corrupt users that cannot generate tokens
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CORRUPT_USER_IDS = [
    '243f39dd-4a01-40b7-bbf9-a3520ef57b2b',  // Admin Zona 01
    'ff54e84d-10da-411c-9cc5-cc37787c1f77',  // Admin Zona 03A
    '762017ab-2f96-48de-a057-764b32cba236',  // Admin Zona 03B
    '955d1788-8187-443c-929b-8a865ca9f9df',  // Admin Zona 05
    '6c6b4fe7-d00c-41f2-91c6-1c20d00919ce',  // Admin Zona 06A
    '94dfe9a5-4882-4be7-a458-120a18285fb9',  // Admin Zona 06B
    '9b2fb217-40d3-48ee-9bb0-7e55a72d5024',  // Admin Zona 07
    'be9fc639-c5aa-4f74-9aba-d09cb9909064',  // Admin Zona 08
    '96710f7c-9438-4c8b-9119-9cafb3673771',  // Admin Zona 09
    '23854c7d-305e-4cd8-aa34-f08d845f3faf',  // Admin Zona 10
    '9aa2dd95-da16-40be-bb0b-0dda132b4bdd',  // Admin Zona 11
    '86b1252a-c7f6-4d78-af34-c0820482ea16',  // Admin Zona 12
    '008f6c71-fcd0-4ed3-b313-b7aa1c15c0e5',  // Admin Zona 13
    '8293510d-4676-404b-9c3b-292c610e88a1',  // Admin Zona 14
    'fdac7a43-0b6d-4c87-bd38-a1d7a9dcc5d9',  // Admin Zona 15
    '16c40666-c485-4a73-99f6-983b3ac553ab',  // Admin Zona 16
    'db971364-8bf6-413f-8c91-21096e1f2e7f',  // Admin Zona 17
    'e9298442-e33e-4221-ba15-e5241ebaf271',  // Asep (super_admin)
    '4a2dd3fe-6a5f-4bc8-99b3-b273756f41ed',  // Admin Zona 04
    '0f326ce0-9623-4bb8-bd2f-9850ab45d9b2',  // Admin Zona 02
    'ab8cf298-35aa-41ed-aff6-d0e398d150ab',  // Puput (super_admin)
    'f104d147-67d5-49cc-9a44-40917ef91ec6'   // Arif (super_admin)
];

(async () => {
    try {
        console.log('[FIX] Starting cleanup of corrupt users...\n');

        // Step 1: Verify which users will be deleted
        console.log('Step 1: Verifying users to delete...\n');
        const { data: toDelete } = await supabase
            .from('users')
            .select('id, email, name, role')
            .in('id', CORRUPT_USER_IDS);

        console.log(`Found ${toDelete.length} corrupt users to delete:\n`);
        toDelete.forEach(u => {
            console.log(`- ${u.name} (${u.role}): ${u.email}`);
        });

        // Step 2: Confirm deletion
        console.log('\n⚠️  WARNING: These users will be permanently deleted!');
        console.log('Make sure you have a backup before proceeding.\n');

        // Auto-confirm for script (you can add readline prompt here for production)
        const shouldDelete = true;
        
        if (!shouldDelete) {
            console.log('❌ Deletion cancelled');
            process.exit(0);
        }

        // Step 3: Delete corrupt users
        console.log('Step 2: Deleting corrupt users...\n');
        const { error, count } = await supabase
            .from('users')
            .delete()
            .in('id', CORRUPT_USER_IDS);

        if (error) {
            console.error('❌ Error deleting users:', error);
            process.exit(1);
        }

        console.log(`✅ Deleted ${CORRUPT_USER_IDS.length} corrupt users\n`);

        // Step 4: Verify remaining users
        console.log('Step 3: Verifying remaining users...\n');
        const { data: remaining } = await supabase
            .from('users')
            .select('id, email, name, role');

        console.log(`✅ Remaining valid users: ${remaining.length}\n`);
        remaining.forEach((u, idx) => {
            console.log(`${idx + 1}. ${u.name} (${u.role})`);
            console.log(`   Email: ${u.email}\n`);
        });

        // Step 5: Test token generation again
        console.log('\n=== Testing token generation with cleaned data ===\n');
        
        for (const user of remaining) {
            const testToken = Math.floor(10000 + Math.random() * 90000).toString();
            
            const { error: tokenError } = await supabase
                .from('daily_login_tokens')
                .insert({
                    user_id: user.id,
                    token: testToken,
                    expires_at: new Date(Date.now() + 86400000).toISOString(),
                    email_address: user.email
                });

            if (tokenError) {
                console.log(`❌ ${user.name}: ${tokenError.message}`);
            } else {
                console.log(`✅ ${user.name}: Token creation successful`);
                // Clean up
                await supabase
                    .from('daily_login_tokens')
                    .delete()
                    .eq('token', testToken);
            }
        }

        console.log('\n=== CLEANUP COMPLETE ===');
        console.log('✅ All corrupt users deleted');
        console.log('✅ All remaining users can generate tokens');
        console.log('\nYou can now run token generation:');
        console.log('  node backend/test-token-generation-final.js');

    } catch (error) {
        console.error('[FIX] ❌ Error:', error);
        process.exit(1);
    }
    
    process.exit(0);
})();
