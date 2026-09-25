#!/usr/bin/env node
/**
 * Verify migration success by checking if columns exist
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend/.env' });

async function verify() {
    console.log('[Verify] Checking if migration columns exist...');
    
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
        // Try to query the new columns
        const { data, error } = await supabase
            .from('invoice_file_list')
            .select('faktur, files_uploaded_count, files_required_count')
            .limit(1);

        if (error) {
            console.error('[Verify] ❌ Error:', error.message);
            console.log('[Verify] Columns may not exist yet');
            process.exit(1);
        } else {
            console.log('[Verify] ✅ Columns exist and are queryable!');
            console.log('[Verify] Sample data:', data[0] || 'No data yet');
            console.log('[Verify] Migration successful - backend can now save file counts');
            process.exit(0);
        }
    } catch (err) {
        console.error('[Verify] Exception:', err.message);
        process.exit(1);
    }
}

verify();
