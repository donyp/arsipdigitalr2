#!/usr/bin/env node

/**
 * Fix WhatsApp Notifications Foreign Key Constraint
 * 
 * Removes the moderator_id foreign key constraint to allow
 * notifications to be saved even if user doesn't exist in users table
 * 
 * Usage:
 *   node backend/fix-whatsapp-fk.js
 */

require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

console.log('🔧 Fixing WhatsApp notifications foreign key constraint...\n');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function fixConstraint() {
    try {
        // Check if constraint exists
        const { data: constraints, error: checkError } = await supabase.rpc('exec', {
            command: `
                SELECT constraint_name FROM information_schema.table_constraints 
                WHERE table_name = 'whatsapp_invoice_notifications' 
                AND constraint_type = 'FOREIGN KEY'
            `
        }).catch(() => ({ data: null, error: 'RPC not available' }));

        console.log('📋 Removing moderator_id foreign key constraint...');

        // Remove the constraint
        const { error: dropError } = await supabase.rpc('exec', {
            command: `
                ALTER TABLE whatsapp_invoice_notifications 
                DROP CONSTRAINT IF EXISTS whatsapp_invoice_notifications_moderator_id_fkey
            `
        }).catch(async () => {
            // Fallback: Try using raw query if RPC not available
            console.log('📌 Using Supabase direct SQL execution...');
            
            const { data, error } = await supabase.query(`
                ALTER TABLE whatsapp_invoice_notifications 
                DROP CONSTRAINT IF EXISTS whatsapp_invoice_notifications_moderator_id_fkey
            `);
            
            return { error };
        });

        if (dropError) {
            // It's okay if constraint doesn't exist
            if (!dropError.message?.includes('does not exist')) {
                throw dropError;
            }
        }

        console.log('✅ Foreign key constraint removed successfully!\n');
        console.log('📊 Now moderator_id notifications can be saved without user validation');
        console.log('🚀 Try uploading invoices again - notifications should appear now!');
        
        process.exit(0);

    } catch (error) {
        console.error('❌ Fix failed:');
        console.error(error.message || error);
        console.error('\n📌 Manual fix via Supabase SQL Editor:');
        console.error('   1. Go to https://app.supabase.com');
        console.error('   2. Select your project');
        console.error('   3. Click SQL Editor → New Query');
        console.error('   4. Run this command:');
        console.error('      ALTER TABLE whatsapp_invoice_notifications');
        console.error('      DROP CONSTRAINT IF EXISTS whatsapp_invoice_notifications_moderator_id_fkey;');
        process.exit(1);
    }
}

fixConstraint();
