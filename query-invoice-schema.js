#!/usr/bin/env node

/**
 * Query the ACTUAL schema of invoice_file_list table from Supabase
 * This runs the information_schema query to see what columns REALLY exist
 */

// Load .env manually
const fs = require('fs');
const path = require('path');

function loadEnv() {
    // Try multiple .env locations
    const envPaths = [
        path.join(__dirname, '.env'),
        path.join(__dirname, 'backend', '.env'),
        path.join(__dirname, '..', '.env')
    ];
    
    for (const envPath of envPaths) {
        if (fs.existsSync(envPath)) {
            console.log(`Loading .env from: ${envPath}\n`);
            const content = fs.readFileSync(envPath, 'utf-8');
            const lines = content.split('\n');
            const env = {};
            lines.forEach(line => {
                if (line && !line.startsWith('#')) {
                    const [key, ...valueParts] = line.split('=');
                    if (key && key.trim()) {
                        env[key.trim()] = valueParts.join('=').trim();
                    }
                }
            });
            Object.assign(process.env, env);
            return;
        }
    }
    
    console.warn('⚠️  .env file not found in standard locations');
}

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in .env');
    process.exit(1);
}

async function querySchema() {
    try {
        console.log('📊 Querying ACTUAL schema of invoice_file_list table...\n');
        
        // Fetch one row from the table to see what columns exist
        console.log('📡 Fetching sample row from invoice_file_list...\n');
        
        const response = await fetch(
            `${supabaseUrl}/rest/v1/invoice_file_list?limit=1`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${supabaseKey}`,
                    'apikey': supabaseKey
                }
            }
        );
        
        if (!response.ok) {
            console.error('❌ API Error:', response.status, response.statusText);
            const text = await response.text();
            console.error('Response:', text);
            process.exit(1);
        }
        
        const rows = await response.json();
        
        if (!Array.isArray(rows)) {
            console.error('❌ Unexpected response:', rows);
            process.exit(1);
        }
        
        if (rows.length === 0) {
            console.log('⚠️  No rows in invoice_file_list table');
            console.log('Will attempt to query column information...\n');
            
            // Try to get schema via different method
            const schemaResponse = await fetch(
                `${supabaseUrl}/rest/v1/information_schema.columns?table_name=eq.invoice_file_list&limit=100`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${supabaseKey}`,
                        'apikey': supabaseKey
                    }
                }
            );
            
            if (schemaResponse.ok) {
                const columns = await schemaResponse.json();
                console.log('✅ ACTUAL Schema Results (from information_schema):');
                console.log('═══════════════════════════════════════════════════════');
                console.table(columns.map(c => ({
                    column_name: c.column_name,
                    data_type: c.data_type,
                    is_nullable: c.is_nullable
                })));
            }
            return;
        }
        
        const columns = Object.keys(rows[0]).sort();
        
        console.log('✅ ACTUAL Columns in invoice_file_list table:');
        console.log('═══════════════════════════════════════════════════════');
        
        columns.forEach((col, idx) => {
            const value = rows[0][col];
            let dataType = typeof value;
            
            if (value === null) dataType = 'NULL';
            else if (Array.isArray(value)) dataType = 'array';
            else if (value instanceof Date) dataType = 'date';
            
            const mark = col.includes('path') ? ' 📁' : (col.includes('count') ? ' 🔢' : (col.includes('date') || col.includes('at') ? ' 📅' : ''));
            console.log(`${String(idx + 1).padStart(3)}. ${col.padEnd(35)} (${dataType.padEnd(10)})${mark}`);
        });
        
        console.log('═══════════════════════════════════════════════════════');
        console.log(`\n✅ Total Columns: ${columns.length}\n`);
        
        // Show first row as reference
        console.log('📋 Sample Row Data:');
        console.log('───────────────────────────────────────────────────');
        
        Object.entries(rows[0]).forEach(([key, val]) => {
            let display;
            if (val === null) {
                display = '(NULL)';
            } else if (typeof val === 'string' && val.length > 80) {
                display = val.substring(0, 80) + '...';
            } else if (typeof val === 'object') {
                display = JSON.stringify(val).substring(0, 80);
            } else {
                display = String(val);
            }
            console.log(`  ${key}: ${display}`);
        });
        
        console.log('───────────────────────────────────────────────────');
        
    } catch (err) {
        console.error('❌ Unexpected error:', err.message);
        process.exit(1);
    }
}

querySchema();
