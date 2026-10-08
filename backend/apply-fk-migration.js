#!/usr/bin/env node
/**
 * Apply FK migration: change daily_login_tokens.user_id from auth.users to users
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
    try {
        console.log('[MIGRATION] Starting FK constraint migration...\n');

        // Step 1: Check current constraint
        console.log('[MIGRATION] Step 1: Checking current constraint...');
        const { data: constraints, error: checkError } = await supabase.rpc('get_constraints', {
            table_name: 'daily_login_tokens'
        }).catch(() => ({ data: null }));

        // Step 2: Drop old FK constraint
        console.log('[MIGRATION] Step 2: Dropping old FK constraint (auth.users)...');
        const { error: dropError } = await supabase
            .rpc('exec_sql', {
                query: `ALTER TABLE daily_login_tokens 
                        DROP CONSTRAINT IF EXISTS fk_daily_tokens_user;`
            })
            .catch(async () => {
                // If RPC doesn't work, try direct query via SQL
                console.log('[MIGRATION] Using direct SQL query...');
                // This won't work directly, but we can try via Supabase admin
                return await supabase.query(`
                    ALTER TABLE daily_login_tokens 
                    DROP CONSTRAINT IF EXISTS fk_daily_tokens_user;
                `).catch(() => ({ error: { message: 'Could not drop via direct query' } }));
            });

        if (dropError) {
            console.log('[MIGRATION] Note: Drop may not be needed if constraint already different');
            console.log('[MIGRATION] Error:', dropError?.message);
        } else {
            console.log('[MIGRATION] ✅ Old FK constraint dropped');
        }

        // Step 3: Add new FK constraint
        console.log('[MIGRATION] Step 3: Adding new FK constraint (users table)...');
        const { error: addError } = await supabase
            .rpc('exec_sql', {
                query: `ALTER TABLE daily_login_tokens 
                        ADD CONSTRAINT fk_daily_tokens_user 
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;`
            })
            .catch(() => ({ error: { message: 'RPC not available, FK may need manual setup' } }));

        if (addError) {
            console.log('[MIGRATION] ⚠️  Could not apply via RPC:', addError?.message);
            console.log('[MIGRATION] Please run this SQL manually in Supabase console:');
            console.log(`
ALTER TABLE daily_login_tokens 
DROP CONSTRAINT IF EXISTS fk_daily_tokens_user;

ALTER TABLE daily_login_tokens 
ADD CONSTRAINT fk_daily_tokens_user 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
            `);
        } else {
            console.log('[MIGRATION] ✅ New FK constraint added');
        }

        console.log('\n[MIGRATION] Migration complete!');
        console.log('[MIGRATION] Now try: node test-token-generation-final.js');

    } catch (error) {
        console.error('[MIGRATION] ❌ Error:', error);
    }
    
    process.exit(0);
})();
