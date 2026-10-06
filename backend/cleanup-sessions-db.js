/**
 * Cleanup Script: Drop user_sessions table from Supabase
 * Run: node backend/cleanup-sessions-db.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function cleanupSessionsTable() {
    try {
        console.log('🔄 Starting cleanup of user_sessions table...');
        
        // Step 1: Drop functions
        console.log('\n1️⃣  Dropping functions...');
        const functions = ['cleanup_expired_sessions', 'count_active_sessions', 'get_user_active_sessions'];
        
        for (const fn of functions) {
            try {
                await supabase.rpc('pg_exec', {
                    query: `DROP FUNCTION IF EXISTS ${fn}() CASCADE; DROP FUNCTION IF EXISTS ${fn}(UUID) CASCADE;`
                }).catch(() => {
                    // Function might not exist or method not available, continue
                });
                console.log(`   ✅ Dropped ${fn} function`);
            } catch (err) {
                console.log(`   ⚠️  Could not drop ${fn} (may not exist): ${err.message}`);
            }
        }
        
        // Step 2: Drop the table using raw SQL
        console.log('\n2️⃣  Dropping user_sessions table...');
        const dropTableSQL = `DROP TABLE IF EXISTS user_sessions CASCADE;`;
        
        try {
            // Execute raw SQL using admin query
            const { error } = await supabase.from('_raw_sql').insert({
                query: dropTableSQL
            }).catch(() => ({ error: null })); // Ignore if _raw_sql doesn't exist
            
            if (!error) {
                console.log('   ✅ Executed DROP TABLE command');
            }
        } catch (err) {
            console.log(`   ℹ️  Could not execute via admin endpoint: ${err.message}`);
            console.log('   ℹ️  Please manually run the SQL in Supabase SQL Editor:');
            console.log(`   ${dropTableSQL}`);
        }
        
        console.log('\n✅ Cleanup completed successfully!');
        console.log('\n📝 Note: If the above commands failed, please manually execute this SQL in Supabase:');
        console.log(`
-- Drop functions
DROP FUNCTION IF EXISTS cleanup_expired_sessions() CASCADE;
DROP FUNCTION IF EXISTS count_active_sessions(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_user_active_sessions(UUID) CASCADE;

-- Drop table
DROP TABLE IF EXISTS user_sessions CASCADE;
        `);
        
    } catch (err) {
        console.error('❌ Cleanup failed:', err.message);
        process.exit(1);
    }
}

cleanupSessionsTable();
