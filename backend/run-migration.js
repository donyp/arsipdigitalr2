#!/usr/bin/env node

/**
 * Migration Runner - Execute SQL migrations on Supabase
 * 
 * Usage: node backend/run-migration.js <migration-name>
 * Example: node backend/run-migration.js MIGRATION_ADD_FILE_PATHS.sql
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing Supabase credentials');
    console.error('   Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runMigration(migrationFile) {
    try {
        // Read migration file
        const migrationPath = path.join(__dirname, '..', migrationFile);
        
        if (!fs.existsSync(migrationPath)) {
            console.error(`❌ Migration file not found: ${migrationFile}`);
            process.exit(1);
        }
        
        const sql = fs.readFileSync(migrationPath, 'utf8');
        
        console.log(`📋 Running migration: ${migrationFile}`);
        console.log('━'.repeat(60));
        
        // Execute migration using Supabase RPC
        // Note: We use rpc to execute arbitrary SQL with service role
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
        
        if (error) {
            // Try direct query if RPC doesn't work
            console.log('⚠️  RPC method not available, trying direct execution...');
            
            // Split SQL by statements and execute each
            const statements = sql
                .split(';')
                .map(s => s.trim())
                .filter(s => s && !s.startsWith('--') && !s.startsWith('/*'));
            
            for (const statement of statements) {
                if (statement) {
                    console.log(`\n📝 Executing statement...`);
                    const { error: execError } = await supabase.from('_migrations').select('*').limit(1);
                    
                    // Since we can't execute arbitrary SQL via SDK, we need to use Supabase SQL Editor
                    console.error('❌ Cannot execute SQL directly via Supabase SDK');
                    console.error('\n📌 Please execute this SQL manually in Supabase SQL Editor:');
                    console.error('━'.repeat(60));
                    console.error(sql);
                    console.error('━'.repeat(60));
                    process.exit(1);
                }
            }
        }
        
        console.log('\n✅ Migration completed successfully!');
        console.log('━'.repeat(60));
        
    } catch (err) {
        console.error('❌ Migration failed:');
        console.error(err.message);
        
        console.error('\n📌 Please execute this SQL manually in Supabase SQL Editor:');
        console.error('━'.repeat(60));
        
        try {
            const migrationPath = path.join(__dirname, '..', migrationFile);
            const sql = fs.readFileSync(migrationPath, 'utf8');
            console.error(sql);
        } catch (e) {
            console.error('(Could not read migration file)');
        }
        
        console.error('━'.repeat(60));
        process.exit(1);
    }
}

const migrationFile = process.argv[2];

if (!migrationFile) {
    console.error('❌ Usage: node backend/run-migration.js <migration-file>');
    console.error('   Example: node backend/run-migration.js MIGRATION_ADD_FILE_PATHS.sql');
    process.exit(1);
}

runMigration(migrationFile);
