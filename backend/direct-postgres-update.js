/**
 * Update database directly using Supabase REST API
 * Updates the file PATH columns (invoice_pdf_path, bukti_bayar_path, faktur_pajak_path)
 * The database trigger will automatically calculate files_uploaded_count and files_required_count
 */
const https = require('https');

/**
 * Update a specific file path in the database via REST API
 * This bypasses the JS client schema cache completely
 */
async function updateFilePath(faktur, columnName, filePath) {
    return new Promise((resolve) => {
        try {
            const supabaseUrl = process.env.SUPABASE_URL;
            const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            
            if (!supabaseUrl || !serviceRoleKey) {
                console.error('[UpdatePath] Missing Supabase credentials');
                return resolve(false);
            }
            
            console.log(`[UpdatePath] Updating ${columnName} for ${faktur}`);
            
            const url = new URL(supabaseUrl);
            const hostname = url.hostname;
            
            // Update via direct REST PATCH to the table
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
            
            const updateObj = {
                [columnName]: filePath,
                updated_at: new Date().toISOString()
            };
            
            const req = https.request(options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => { responseData += chunk; });
                res.on('end', () => {
                    if (res.statusCode === 204 || res.statusCode === 200) {
                        console.log(`[UpdatePath] ✅ Updated ${columnName} successfully`);
                        resolve(true);
                    } else {
                        console.error(`[UpdatePath] Failed (${res.statusCode}): ${responseData}`);
                        resolve(false);
                    }
                });
            });
            
            req.on('error', (err) => {
                console.error(`[UpdatePath] Network error: ${err.message}`);
                resolve(false);
            });
            
            req.write(JSON.stringify(updateObj));
            req.end();
            
        } catch (err) {
            console.error(`[UpdatePath] Exception: ${err.message}`);
            resolve(false);
        }
    });
}

/**
 * Update file count (deprecated - now using file paths as source of truth)
 */
async function updateFileCountDirectly(faktur, uploadedCount, requiredCount) {
    // This is now a no-op because we're using database triggers
    // The file paths are updated elsewhere, and triggers handle the counts
    console.log(`[DirectREST] File count update delegated to database trigger (${uploadedCount}/${requiredCount})`);
    return true;
}

module.exports = { updateFilePath, updateFileCountDirectly };
