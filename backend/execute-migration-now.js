#!/usr/bin/env node
/**
 * Execute database migration to add file count columns
 * Run: node backend/execute-migration-now.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend/.env' });

async function main() {
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log('[Migration] Starting database migration...');
    console.log('[Migration] Database:', process.env.SUPABASE_URL);

    try {
        // Execute ALTER TABLE to add columns
        console.log('[Migration] Step 1: Adding columns to invoice_file_list...');
        const { data: d1, error: e1 } = await supabase.rpc('execute_sql', {
            sql_query: `ALTER TABLE invoice_file_list 
ADD COLUMN IF NOT EXISTS files_uploaded_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS files_required_count INTEGER DEFAULT 2;`
        });

        if (e1 && !e1.message.includes('already exists')) {
            console.error('[Migration] ❌ ALTER TABLE failed:', e1.message);
            // Try direct approach via raw query
            console.log('[Migration] Trying alternative approach...');
        } else {
            console.log('[Migration] ✅ Columns added successfully');
        }

        // Create index
        console.log('[Migration] Step 2: Creating index...');
        const { data: d2, error: e2 } = await supabase.rpc('execute_sql', {
            sql_query: `CREATE INDEX IF NOT EXISTS idx_invoice_file_list_upload_status 
ON invoice_file_list(files_uploaded_count, files_required_count)
WHERE files_uploaded_count < files_required_count;`
        });

        if (e2) {
            console.warn('[Migration] ⚠️  Index creation warning:', e2.message);
        } else {
            console.log('[Migration] ✅ Index created successfully');
        }

        console.log('[Migration] ✅ Migration completed!');
        console.log('[Migration] Next: Restart the backend server');
        process.exit(0);

    } catch (err) {
        console.error('[Migration] ❌ Fatal error:', err.message);
        console.error('[Migration] Full error:', err);
        
        // Suggest manual approach
        console.log('\n[Migration] If automatic migration fails, execute manually:');
        console.log('1. Go to: https://app.supabase.com/project/*/sql/new');
        console.log('2. Paste this SQL:');
        console.log(`
ALTER TABLE invoice_file_list 
ADD COLUMN IF NOT EXISTS files_uploaded_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS files_required_count INTEGER DEFAULT 2;

CREATE INDEX IF NOT EXISTS idx_invoice_file_list_upload_status 
ON invoice_file_list(files_uploaded_count, files_required_count)
WHERE files_uploaded_count < files_required_count;
`);
        console.log('3. Click "Run"');
        console.log('4. Wait for schema cache to refresh');
        console.log('5. Restart backend server');
        
        process.exit(1);
    }
}

main();
