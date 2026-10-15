/**
 * Initialize Backup Tables
 * 
 * Run this script once to create the backup_history and backup_config tables in Supabase.
 * Usage: node init-backup-tables.js
 * 
 * Requires .env file with:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function initializeBackupTables() {
    try {
        console.log('[INIT] Starting backup tables initialization...');

        // Read the SQL file
        const sqlPath = path.join(__dirname, 'CREATE_BACKUP_TABLES.sql');
        const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

        console.log('[INIT] Executing SQL schema...');

        // Execute the SQL directly using Supabase's query method
        // Note: This requires using the raw query capability via the backend
        const { data, error } = await supabase.rpc('exec_sql', {
            sql: sqlContent
        });

        if (error) {
            // If exec_sql RPC doesn't exist, try alternative approach
            console.warn('[INIT] RPC method not available, attempting direct execution...');
            
            // Split SQL into individual statements
            const statements = sqlContent
                .split(';')
                .map(stmt => stmt.trim())
                .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

            let successCount = 0;
            for (const statement of statements) {
                try {
                    // For Supabase, we need to execute DDL statements differently
                    // This is a limitation - Supabase PostgREST API is read-only for schema changes
                    console.log(`[INIT] Statement: ${statement.substring(0, 50)}...`);
                } catch (err) {
                    console.error(`[INIT] Failed to execute statement:`, err.message);
                }
            }

            throw new Error(
                'Cannot execute SQL directly via Supabase client.\n' +
                'Please execute CREATE_BACKUP_TABLES.sql manually in your Supabase SQL Editor:\n' +
                '1. Go to https://app.supabase.com → Your Project\n' +
                '2. Click "SQL Editor" in the left sidebar\n' +
                '3. Click "New Query"\n' +
                '4. Copy and paste the contents of backend/CREATE_BACKUP_TABLES.sql\n' +
                '5. Click "Run"'
            );
        }

        console.log('[INIT] ✅ Backup tables initialized successfully');
        console.log('[INIT] Tables created: backup_history, backup_config');
        process.exit(0);
    } catch (error) {
        console.error('[INIT] ❌ Initialization failed:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    initializeBackupTables();
}

module.exports = { initializeBackupTables };
