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
            
            // Update via direct REST PATCH to the table
            // IMPORTANT: Use apikey header (not Authorization Bearer) for Supabase REST API
            const options = {
                hostname: hostname,
                path: `/rest/v1/invoice_file_list?faktur=eq.${encodeURIComponent(faktur)}`,
                method: 'PATCH',
                headers: {
                    'apikey': serviceRoleKey,  // Changed from Authorization: Bearer
                    'Authorization': `Bearer ${serviceRoleKey}`,  // Keep both for safety
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
                        console.error(`[DirectREST] Failed with status ${res.statusCode}: ${responseData}`);
                        resolve(false);
                    }
                });
            });
            
            req.on('error', (err) => {
                console.error(`[DirectREST] Network error: ${err.message}`);
                resolve(false);
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

module.exports = { updateFileCountDirectly };
