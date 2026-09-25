#!/usr/bin/env node
/**
 * Query what columns actually exist in invoice_file_list
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend/.env' });

async function checkColumns() {
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
        console.log('[ColumnCheck] Fetching a sample row to see what columns exist...');
        
        const { data, error } = await supabase
            .from('invoice_file_list')
            .select('*')
            .limit(1)
            .single();

        if (error) {
            console.error('[ColumnCheck] Error:', error.message);
            return;
        }

        if (!data) {
            console.log('[ColumnCheck] No data found in table');
            return;
        }

        console.log('[ColumnCheck] ✅ Columns that exist in invoice_file_list:');
        console.log('');
        
        const columns = Object.keys(data).sort();
        columns.forEach((col, i) => {
            const value = data[col];
            const type = value === null ? 'NULL' : typeof value;
            const sample = value ? String(value).substring(0, 30) : 'null';
            console.log(`  ${String(i + 1).padStart(2, ' ')}. ${col.padEnd(30, ' ')} (${type.padEnd(10, ' ')}) = ${sample}`);
        });

        console.log('');
        const hasUploadedCount = columns.includes('files_uploaded_count');
        const hasRequiredCount = columns.includes('files_required_count');
        
        if (hasUploadedCount && hasRequiredCount) {
            console.log('✅ SUCCESS: files_uploaded_count and files_required_count columns exist!');
        } else {
            console.log('❌ MISSING COLUMNS:');
            if (!hasUploadedCount) console.log('  - files_uploaded_count');
            if (!hasRequiredCount) console.log('  - files_required_count');
            console.log('');
            console.log('You must run the migration SQL in Supabase SQL Editor:');
            console.log('ALTER TABLE invoice_file_list ADD COLUMN IF NOT EXISTS files_uploaded_count INTEGER DEFAULT 0, ADD COLUMN IF NOT EXISTS files_required_count INTEGER DEFAULT 2;');
        }

    } catch (err) {
        console.error('[ColumnCheck] Exception:', err.message);
    }
}

checkColumns();
