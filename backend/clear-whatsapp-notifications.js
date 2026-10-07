#!/usr/bin/env node

/**
 * Clear WhatsApp Invoice Notifications
 * 
 * Usage:
 *   node backend/clear-whatsapp-notifications.js [option]
 * 
 * Options:
 *   (no option)  - Delete ALL notifications
 *   pending      - Delete only pending (not sent) notifications
 *   sent         - Delete only sent notifications
 *   zona <id>    - Delete notifications for specific zona
 *   before <date> - Delete notifications before date (YYYY-MM-DD)
 * 
 * Examples:
 *   node backend/clear-whatsapp-notifications.js
 *   node backend/clear-whatsapp-notifications.js pending
 *   node backend/clear-whatsapp-notifications.js zona 5
 */

require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function clearNotifications() {
    try {
        const args = process.argv.slice(2);
        const option = args[0];
        const param = args[1];

        console.log('⚠️  WhatsApp Notifications Clear Tool\n');

        let query = supabase.from('whatsapp_invoice_notifications');
        let description = 'ALL notifications';

        // Build query based on option
        if (option === 'pending') {
            query = query.is('sent_at', null);
            description = 'PENDING notifications (not sent)';
        } else if (option === 'sent') {
            query = query.not('sent_at', 'is', null);
            description = 'SENT notifications';
        } else if (option === 'zona' && param) {
            query = query.eq('zona_id', parseInt(param));
            description = `notifications for ZONA ${param}`;
        } else if (option === 'before' && param) {
            query = query.lt('created_at', param);
            description = `notifications created BEFORE ${param}`;
        } else if (option && option !== 'pending' && option !== 'sent' && option !== 'zona' && option !== 'before') {
            console.log('❓ Unknown option:', option);
            console.log('\nUsage:');
            console.log('  node backend/clear-whatsapp-notifications.js [option] [param]');
            console.log('\nOptions:');
            console.log('  (no option)        Delete ALL notifications');
            console.log('  pending            Delete only pending notifications');
            console.log('  sent               Delete only sent notifications');
            console.log('  zona <id>          Delete zona-specific notifications');
            console.log('  before <YYYY-MM-DD> Delete notifications before date\n');
            process.exit(1);
        }

        // First, count how many will be deleted
        const { data: countData, error: countError } = await query.select('id', { count: 'exact', head: true });
        
        if (countError) throw countError;

        const count = countData?.length || 0;

        if (count === 0) {
            console.log(`ℹ️  No ${description} found to delete`);
            process.exit(0);
        }

        // Ask for confirmation
        console.log(`📊 Found: ${count} ${description}\n`);
        console.log('⚠️  WARNING: This will DELETE the selected notifications PERMANENTLY!\n');

        // For automated runs, use --force flag
        if (process.argv.includes('--force')) {
            console.log('✓ Proceeding with --force flag\n');
        } else {
            console.log('❌ Use --force flag to confirm deletion');
            console.log('   Example: node backend/clear-whatsapp-notifications.js --force\n');
            process.exit(0);
        }

        // Delete the notifications
        console.log('🗑️  Deleting notifications...\n');
        
        const { error: deleteError, count: deletedCount } = await query.delete().select('id', { count: 'exact' });

        if (deleteError) throw deleteError;

        console.log(`✅ SUCCESS! Deleted ${count} ${description}\n`);

        // Show remaining count
        const { data: remaining } = await supabase
            .from('whatsapp_invoice_notifications')
            .select('id', { count: 'exact', head: true });

        const remainingCount = remaining?.length || 0;
        console.log(`📊 Remaining notifications in database: ${remainingCount}\n`);

    } catch (error) {
        console.error('❌ Error:');
        console.error(error.message || error);
        process.exit(1);
    }
}

clearNotifications();
