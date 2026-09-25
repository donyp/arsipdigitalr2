#!/usr/bin/env node
/**
 * Check invoice_file_list table schema to see if columns were added
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend/.env' });

async function check() {
    console.log('[CheckSchema] Inspecting invoice_file_list table...');
    
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
        // Query information_schema to see actual columns
        const { data, error } = await supabase.rpc('get_table_columns', {
            table_name: 'invoice_file_list'
        });

        if (error) {
            console.log('[CheckSchema] RPC not available, trying direct query...');
            
            // Try to select from system table
            const { data: cols, error: colsErr } = await supabase
                .from('information_schema.columns')
                .select('column_name, data_type')
                .eq('table_name', 'invoice_file_list')
                .eq('table_schema', 'public');
            
            if (colsErr) {
                console.error('[CheckSchema] ❌ Cannot access schema info:', colsErr.message);
            } else {
                console.log('[CheckSchema] Columns found:');
                cols.forEach(col => console.log(`  - ${col.column_name} (${col.data_type})`));
                
                const hasUploadedCount = cols.some(c => c.column_name === 'files_uploaded_count');
                const hasRequiredCount = cols.some(c => c.column_name === 'files_required_count');
                
                if (hasUploadedCount && hasRequiredCount) {
                    console.log('[CheckSchema] ✅ Migration columns found!');
                } else {
                    console.log('[CheckSchema] ❌ Migration columns NOT found');
                    console.log('[CheckSchema] Please verify the SQL ran successfully in Supabase');
                }
            }
        } else {
            console.log('[CheckSchema] Table columns:', data);
        }

    } catch (err) {
        console.error('[CheckSchema] Exception:', err.message);
    }
}

check();
