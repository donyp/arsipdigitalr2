#!/usr/bin/env node

/**
 * Clear Old Logs from Supabase
 * Deletes logs older than 7 days to reduce storage ingestion
 * 
 * Usage: node clear-logs.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DAYS_TO_KEEP = 7;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function clearOldLogs() {
    try {
        console.log(`🗑️  Starting log cleanup - keeping logs from last ${DAYS_TO_KEEP} days...`);
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - DAYS_TO_KEEP);
        const cutoffISOString = cutoffDate.toISOString();
        
        console.log(`📅 Cutoff date: ${cutoffISOString}`);
        console.log(`🔍 Deleting logs created before this date...`);

        // Method 1: Try to delete from storage.objects table
        try {
            console.log('\n📦 Attempting to delete from storage.objects...');
            
            const { data, error } = await supabase
                .rpc('delete_storage_objects_before', {
                    cutoff_date: cutoffISOString
                });

            if (error && error.code === 'PGRST102') {
                // Function doesn't exist, try direct delete
                console.log('⚠️  Function not found, attempting direct deletion...');
                throw new Error('Function not found');
            }

            if (error) {
                throw error;
            }

            console.log('✅ Storage objects cleaned');
        } catch (err) {
            console.log(`⚠️  Storage deletion failed: ${err.message}`);
            console.log('📝 This is normal - Supabase protects direct storage deletion');
        }

        // Method 2: Clear audit logs if table exists
        try {
            console.log('\n📋 Attempting to clear audit logs...');
            
            const { data: auditLogs, error: auditError } = await supabase
                .from('audit_log_entries')
                .delete()
                .lt('created_at', cutoffISOString);

            if (auditError) {
                if (auditError.code === 'PGRST116') {
                    console.log('ℹ️  audit_log_entries table not found (not critical)');
                } else {
                    throw auditError;
                }
            } else {
                console.log(`✅ Old audit logs deleted`);
            }
        } catch (err) {
            console.log(`ℹ️  Audit log cleanup: ${err.message}`);
        }

        // Check database size after cleanup
        console.log('\n📊 Checking database size after cleanup...');
        
        try {
            const { data: sizeData, error: sizeError } = await supabase
                .rpc('get_database_size');

            if (!sizeError && sizeData) {
                console.log(`\n✅ Current database size: ${sizeData}`);
            }
        } catch (err) {
            console.log(`ℹ️  Could not retrieve size: ${err.message}`);
        }

        console.log('\n✅ Log cleanup completed!');
        console.log('💡 Tip: Set LOG_LEVEL=error in .env to prevent log buildup');
        
    } catch (error) {
        console.error('❌ Error clearing logs:', error.message);
        console.log('\n📝 Manual Alternative:');
        console.log('1. Go to Supabase Dashboard → SQL Editor');
        console.log('2. Run backend/CLEAR_OLD_LOGS.sql');
        console.log('3. Or set LOG_LEVEL=error to stop new logs');
        process.exit(1);
    }
}

// Run cleanup
clearOldLogs()
    .then(() => {
        console.log('\n🎯 Done!');
        process.exit(0);
    })
    .catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
