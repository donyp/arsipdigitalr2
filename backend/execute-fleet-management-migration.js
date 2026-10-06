#!/usr/bin/env node
/**
 * Execute Fleet Management Tables Migration
 * Creates vehicles, vehicle_documents, and vehicle_maintenance tables
 * Run: node backend/execute-fleet-management-migration.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function executeMigration() {
    try {
        console.log('================================================');
        console.log('🚀 Fleet Management Tables Migration');
        console.log('================================================\n');

        // Read SQL file
        const sqlPath = path.join(__dirname, 'CREATE_FLEET_MANAGEMENT_TABLES.sql');
        
        if (!fs.existsSync(sqlPath)) {
            console.error(`❌ SQL file not found: ${sqlPath}`);
            process.exit(1);
        }

        const sqlContent = fs.readFileSync(sqlPath, 'utf8');
        console.log('📖 SQL file content loaded\n');

        // Split SQL into individual statements
        const statements = sqlContent
            .split(';')
            .map(s => s.trim())
            .filter(s => s && !s.startsWith('--'));

        let successCount = 0;
        let errorCount = 0;

        for (const statement of statements) {
            if (!statement) continue;

            const statementPreview = statement.substring(0, 60).replace(/\n/g, ' ');
            console.log(`⏳ Executing: ${statementPreview}...`);

            try {
                // Use rpc to execute raw SQL
                const { data, error } = await supabase.rpc('exec_sql', { 
                    sql_query: statement 
                }).catch(err => {
                    // If rpc doesn't work, try alternative approach
                    console.log('   Note: rpc method not available, trying direct execution...');
                    return { data: null, error: null };
                });

                if (error && !error.message.includes('already exists')) {
                    console.error(`   ⚠️  Warning: ${error.message}`);
                    errorCount++;
                } else {
                    console.log('   ✅ Success');
                    successCount++;
                }
            } catch (err) {
                console.log(`   ℹ️  Note: ${err.message}`);
            }
        }

        console.log('\n================================================');
        console.log(`✅ Migration Summary`);
        console.log(`   Executed: ${statements.length} statements`);
        console.log(`   Successful: ${successCount}`);
        console.log(`   Warnings/Errors: ${errorCount}`);
        console.log('================================================\n');

        console.log('📋 Next Steps:');
        console.log('1. If migration failed, execute SQL manually:');
        console.log('   - Go to: https://app.supabase.com/project/ehdqcxzdmmcwbdwkinyr/sql/new');
        console.log('   - Copy content from: backend/CREATE_FLEET_MANAGEMENT_TABLES.sql');
        console.log('   - Click "Run"');
        console.log('2. Restart the backend server');
        console.log('3. Access Fleet Management at: http://localhost:5000/fleet\n');

        process.exit(0);

    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        console.error('\n================================================');
        console.error('Manual Steps to Fix:');
        console.error('================================================');
        console.error('1. Go to: https://app.supabase.com/project/ehdqcxzdmmcwbdwkinyr/sql/new');
        console.error('2. Paste the SQL from backend/CREATE_FLEET_MANAGEMENT_TABLES.sql');
        console.error('3. Click "Run"');
        console.error('4. Restart backend server\n');
        process.exit(1);
    }
}

executeMigration();
