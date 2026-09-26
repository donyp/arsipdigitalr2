#!/usr/bin/env node
/**
 * Update file counts in database using raw SQL via Supabase REST API
 * Bypasses the schema cache issue entirely
 */

require('dotenv').config({ path: './backend/.env' });
const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function updateCounts() {
    console.log('[UpdateCounts] Starting manual update of file counts...');
    
    // For invoice 835100311020926004, set to 2/3
    const sql = `
        UPDATE invoice_file_list 
        SET files_uploaded_count = 2, 
            files_required_count = 3,
            updated_at = NOW()
        WHERE faktur = '835100311020926004';
    `;
    
    console.log('[UpdateCounts] Executing SQL via REST API...');
    console.log('[UpdateCounts] SQL:', sql);
    
    return new Promise((resolve, reject) => {
        const options = {
            hostname: SUPABASE_URL.replace('https://', '').split('/')[0],
            path: '/rest/v1/rpc/exec_sql',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                console.log('[UpdateCounts] Response status:', res.statusCode);
                console.log('[UpdateCounts] Response:', data);
                
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log('[UpdateCounts] ✅ Update successful');
                } else {
                    console.log('[UpdateCounts] ⚠️  Update may have failed');
                }
                resolve();
            });
        });
        
        req.on('error', (err) => {
            console.error('[UpdateCounts] ❌ Error:', err.message);
            reject(err);
        });
        
        req.write(JSON.stringify({ sql_query: sql }));
        req.end();
    });
}

updateCounts().catch(console.error);
