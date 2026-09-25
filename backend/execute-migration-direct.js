#!/usr/bin/env node
/**
 * Direct SQL execution via Supabase REST API
 */

const https = require('https');
require('dotenv').config({ path: './backend/.env' });

const DB_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// SQL to execute
const SQL = `ALTER TABLE invoice_file_list 
ADD COLUMN IF NOT EXISTS files_uploaded_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS files_required_count INTEGER DEFAULT 2;

CREATE INDEX IF NOT EXISTS idx_invoice_file_list_upload_status 
ON invoice_file_list(files_uploaded_count, files_required_count)
WHERE files_uploaded_count < files_required_count;`;

async function executeSQL() {
    console.log('[DirectSQL] Starting migration...');
    console.log('[DirectSQL] Database URL:', DB_URL);
    
    try {
        // Use Supabase JS client with direct query
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(DB_URL, SERVICE_KEY);
        
        // Try querying a simple table to test connection
        const { data: testData, error: testError } = await supabase
            .from('invoice_file_list')
            .select('faktur')
            .limit(1);
        
        if (testError) {
            console.error('[DirectSQL] ❌ Connection test failed:', testError.message);
            process.exit(1);
        }
        
        console.log('[DirectSQL] ✅ Database connection OK');
        console.log('[DirectSQL] ⚠️  Supabase JS client cannot execute raw ALTER TABLE statements');
        console.log('[DirectSQL] You must run this manually in Supabase SQL Editor:');
        console.log('\n=== COPY THIS SQL AND RUN IN SUPABASE SQL EDITOR ===\n');
        console.log(SQL);
        console.log('\n=== END SQL ===\n');
        console.log('Instructions:');
        console.log('1. Open: https://app.supabase.com/project/*/sql/new');
        console.log('2. Paste the SQL above');
        console.log('3. Click "Run"');
        console.log('4. Wait for completion');
        console.log('5. Restart the backend server');
        
    } catch (err) {
        console.error('[DirectSQL] Error:', err.message);
    }
}

executeSQL();
