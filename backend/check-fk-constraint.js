#!/usr/bin/env node
/**
 * Check current FK constraint on daily_login_tokens
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
    try {
        console.log('[CHECK] Checking FK constraint on daily_login_tokens...\n');

        // Query information_schema
        const { data, error } = await supabase
            .from('information_schema.table_constraints')
            .select('constraint_name, constraint_type, table_name')
            .eq('table_name', 'daily_login_tokens');

        if (error) {
            console.log('[CHECK] Could not query information_schema directly');
            console.log('[CHECK] Error:', error?.message);
            console.log('\n[CHECK] Attempting to query via raw SQL...');
            
            // Try to get constraint info another way - try to insert a bad record
            console.log('\n[CHECK] Testing FK by inserting invalid user_id...');
            const { error: testError } = await supabase
                .from('daily_login_tokens')
                .insert({
                    user_id: '00000000-0000-0000-0000-000000000000',
                    token: '99999',
                    expires_at: new Date(Date.now() + 86400000).toISOString(),
                    email_address: 'test@example.com',
                    email_sent: false
                });

            if (testError) {
                if (testError.message?.includes('violates foreign key constraint')) {
                    const refTable = testError.details?.includes('auth.users') ? 'auth.users' : 
                                     testError.details?.includes('users') ? 'users' : 'unknown';
                    console.log(`\n✅ FK constraint IS ACTIVE and points to: ${refTable}`);
                    console.log(`Details: ${testError.details || testError.message}`);
                } else {
                    console.log(`\n⚠️ Different error (not FK):`, testError.message);
                }
            } else {
                console.log('\n❌ No FK constraint! Insert succeeded when it should fail');
                // Clean up test record
                await supabase
                    .from('daily_login_tokens')
                    .delete()
                    .eq('token', '99999');
            }
        } else {
            console.log('Constraints found:', data);
        }

    } catch (error) {
        console.error('[CHECK] ❌ Error:', error);
    }
    
    process.exit(0);
})();
