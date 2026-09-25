/**
 * Update database directly using Supabase REST API
 * Bypasses the JS client schema cache by using raw HTTP requests
 */
const https = require('https');

/**
 * Update files_uploaded_count directly via REST API
 * This bypasses the JS client schema cache completely
 */
async function updateFileCountDirectly(faktur, uploadedCount, requiredCount) {
    return new Promise((resolve) => {
        try {
            const supabaseUrl = process.env.SUPABASE_URL;
            const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            
            if (!supabaseUrl || !serviceRoleKey) {
                console.error('[DirectREST] Missing Supabase credentials');
                return resolve(false);
            }
            
            console.log(`[DirectREST] Updating ${faktur}: ${uploadedCount}/${requiredCount}`);
            
            const url = new URL(supabaseUrl);
            const hostname = url.hostname;
            
            // Try to update via direct REST PATCH to the table
            // IMPORTANT: Use apikey header (not Authorization Bearer) for Supabase REST API
            const options = {
                hostname: hostname,
                path: `/rest/v1/invoice_file_list?faktur=eq.${encodeURIComponent(faktur)}`,
                method: 'PATCH',
                headers: {
                    'apikey': serviceRoleKey,
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                }
            };
            
            const req = https.request(options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => { responseData += chunk; });
                res.on('end', () => {
                    if (res.statusCode === 204 || res.statusCode === 200) {
                        console.log(`[DirectREST] ✅ Updated successfully (${res.statusCode})`);
                        resolve(true);
                    } else {
                        console.error(`[DirectREST] REST update failed (${res.statusCode}), trying SQL RPC fallback...`);
                        // Fallback: try via SQL RPC
                        updateViaRPC(supabaseUrl, serviceRoleKey, faktur, uploadedCount, requiredCount)
                            .then(success => resolve(success));
                    }
                });
            });
            
            req.on('error', (err) => {
                console.error(`[DirectREST] Network error: ${err.message}, trying SQL RPC fallback...`);
                updateViaRPC(supabaseUrl, serviceRoleKey, faktur, uploadedCount, requiredCount)
                    .then(success => resolve(success));
            });
            
            const body = JSON.stringify({
                files_uploaded_count: uploadedCount,
                files_required_count: requiredCount,
                updated_at: new Date().toISOString()
            });
            
            req.write(body);
            req.end();
            
        } catch (err) {
            console.error(`[DirectREST] Exception: ${err.message}`);
            resolve(false);
        }
    });
}

/**
 * Fallback: Update via SQL RPC call
 */
async function updateViaRPC(supabaseUrl, serviceRoleKey, faktur, uploadedCount, requiredCount) {
    return new Promise((resolve) => {
        try {
            const url = new URL(supabaseUrl);
            const hostname = url.hostname;
            
            // Call rpc/exec_sql endpoint (if it exists)
            const options = {
                hostname: hostname,
                path: `/rest/v1/rpc/exec_sql`,
                method: 'POST',
                headers: {
                    'apikey': serviceRoleKey,
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'Content-Type': 'application/json'
                }
            };
            
            const sqlQuery = `
                UPDATE invoice_file_list 
                SET files_uploaded_count = ${uploadedCount},
                    files_required_count = ${requiredCount},
                    updated_at = NOW()
                WHERE faktur = '${faktur.replace(/'/g, "''")}'
            `;
            
            const req = https.request(options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => { responseData += chunk; });
                res.on('end', () => {
                    if (res.statusCode === 200 || res.statusCode === 204) {
                        console.log(`[DirectRPC] ✅ SQL RPC update succeeded`);
                        resolve(true);
                    } else {
                        console.error(`[DirectRPC] Failed (${res.statusCode}): ${responseData}`);
                        resolve(false);
                    }
                });
            });
            
            req.on('error', (err) => {
                console.error(`[DirectRPC] Network error: ${err.message}`);
                resolve(false);
            });
            
            req.write(JSON.stringify({ sql_query: sqlQuery }));
            req.end();
            
        } catch (err) {
            console.error(`[DirectRPC] Exception: ${err.message}`);
            resolve(false);
        }
    });
}

module.exports = { updateFileCountDirectly };
