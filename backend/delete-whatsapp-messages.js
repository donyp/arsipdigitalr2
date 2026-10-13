#!/usr/bin/env node
/**
 * Delete WhatsApp Messages - Interactive Tool
 * 
 * Usage:
 *   node backend/delete-whatsapp-messages.js
 *   node backend/delete-whatsapp-messages.js --all        # Delete semua
 *   node backend/delete-whatsapp-messages.js --sent       # Delete yang sudah sent
 *   node backend/delete-whatsapp-messages.js --unsent     # Delete yang belum sent
 *   node backend/delete-whatsapp-messages.js --old 30     # Delete > 30 hari lalu
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const args = process.argv.slice(2);

async function deleteAllMessages() {
    try {
        console.log('\n🗑️  Deleting ALL WhatsApp messages...\n');
        
        // Count before delete
        const { data: countBefore } = await supabase
            .from('whatsapp_notifications')
            .select('*', { count: 'exact', head: true });
        
        const { data: countBefore2 } = await supabase
            .from('whatsapp_invoice_notifications')
            .select('*', { count: 'exact', head: true });
        
        console.log(`Before delete:`);
        console.log(`  - whatsapp_notifications: ${countBefore?.length || 0}`);
        console.log(`  - whatsapp_invoice_notifications: ${countBefore2?.length || 0}`);
        
        // Delete all
        const { error: error1 } = await supabase
            .from('whatsapp_notifications')
            .delete()
            .neq('id', 'null');
        
        const { error: error2 } = await supabase
            .from('whatsapp_invoice_notifications')
            .delete()
            .neq('id', 'null');
        
        if (error1) throw error1;
        if (error2) throw error2;
        
        // Count after delete
        const { data: countAfter } = await supabase
            .from('whatsapp_notifications')
            .select('*', { count: 'exact', head: true });
        
        const { data: countAfter2 } = await supabase
            .from('whatsapp_invoice_notifications')
            .select('*', { count: 'exact', head: true });
        
        console.log(`\nAfter delete:`);
        console.log(`  ✓ whatsapp_notifications: ${countAfter?.length || 0}`);
        console.log(`  ✓ whatsapp_invoice_notifications: ${countAfter2?.length || 0}`);
        console.log(`\n✅ All WhatsApp messages deleted!\n`);
        
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

async function deleteSentMessages() {
    try {
        console.log('\n🗑️  Deleting only SENT WhatsApp messages...\n');
        
        // Count sent messages
        const { data: sentBefore } = await supabase
            .from('whatsapp_notifications')
            .select('*', { count: 'exact', head: true })
            .not('sent_at', 'is', null);
        
        const { data: sentBefore2 } = await supabase
            .from('whatsapp_invoice_notifications')
            .select('*', { count: 'exact', head: true })
            .not('sent_at', 'is', null);
        
        console.log(`Sent messages to delete:`);
        console.log(`  - whatsapp_notifications: ${sentBefore?.length || 0}`);
        console.log(`  - whatsapp_invoice_notifications: ${sentBefore2?.length || 0}`);
        
        // Delete sent messages
        const { error: error1 } = await supabase
            .from('whatsapp_notifications')
            .delete()
            .not('sent_at', 'is', null);
        
        const { error: error2 } = await supabase
            .from('whatsapp_invoice_notifications')
            .delete()
            .not('sent_at', 'is', null);
        
        if (error1) throw error1;
        if (error2) throw error2;
        
        console.log(`\n✅ All SENT messages deleted!\n`);
        
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

async function deleteUnsentMessages() {
    try {
        console.log('\n🗑️  Deleting only UNSENT WhatsApp messages...\n');
        
        // Count unsent messages
        const { data: unsentBefore } = await supabase
            .from('whatsapp_notifications')
            .select('*', { count: 'exact', head: true })
            .is('sent_at', null);
        
        const { data: unsentBefore2 } = await supabase
            .from('whatsapp_invoice_notifications')
            .select('*', { count: 'exact', head: true })
            .is('sent_at', null);
        
        console.log(`Unsent messages to delete:`);
        console.log(`  - whatsapp_notifications: ${unsentBefore?.length || 0}`);
        console.log(`  - whatsapp_invoice_notifications: ${unsentBefore2?.length || 0}`);
        
        // Delete unsent messages
        const { error: error1 } = await supabase
            .from('whatsapp_notifications')
            .delete()
            .is('sent_at', null);
        
        const { error: error2 } = await supabase
            .from('whatsapp_invoice_notifications')
            .delete()
            .is('sent_at', null);
        
        if (error1) throw error1;
        if (error2) throw error2;
        
        console.log(`\n✅ All UNSENT messages deleted!\n`);
        
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

async function deleteOldMessages(days) {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));
        
        console.log(`\n🗑️  Deleting WhatsApp messages older than ${days} days (before ${cutoffDate.toISOString().split('T')[0]})...\n`);
        
        // Count old messages
        const { data: oldBefore } = await supabase
            .from('whatsapp_notifications')
            .select('*', { count: 'exact', head: true })
            .lt('created_at', cutoffDate.toISOString());
        
        const { data: oldBefore2 } = await supabase
            .from('whatsapp_invoice_notifications')
            .select('*', { count: 'exact', head: true })
            .lt('created_at', cutoffDate.toISOString());
        
        console.log(`Old messages to delete:`);
        console.log(`  - whatsapp_notifications: ${oldBefore?.length || 0}`);
        console.log(`  - whatsapp_invoice_notifications: ${oldBefore2?.length || 0}`);
        
        // Delete old messages
        const { error: error1 } = await supabase
            .from('whatsapp_notifications')
            .delete()
            .lt('created_at', cutoffDate.toISOString());
        
        const { error: error2 } = await supabase
            .from('whatsapp_invoice_notifications')
            .delete()
            .lt('created_at', cutoffDate.toISOString());
        
        if (error1) throw error1;
        if (error2) throw error2;
        
        console.log(`\n✅ Old messages (> ${days} days) deleted!\n`);
        
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

async function showStats() {
    try {
        console.log('\n📊 WhatsApp Messages Statistics\n');
        
        // Total messages
        const { data: total1 } = await supabase
            .from('whatsapp_notifications')
            .select('*', { count: 'exact', head: true });
        
        const { data: total2 } = await supabase
            .from('whatsapp_invoice_notifications')
            .select('*', { count: 'exact', head: true });
        
        console.log(`Total messages:`);
        console.log(`  - whatsapp_notifications: ${total1?.length || 0}`);
        console.log(`  - whatsapp_invoice_notifications: ${total2?.length || 0}`);
        
        // Sent vs Unsent
        const { data: sent1 } = await supabase
            .from('whatsapp_notifications')
            .select('*', { count: 'exact', head: true })
            .not('sent_at', 'is', null);
        
        const { data: unsent1 } = await supabase
            .from('whatsapp_notifications')
            .select('*', { count: 'exact', head: true })
            .is('sent_at', null);
        
        console.log(`\nwhatsapp_notifications:`);
        console.log(`  - Sent: ${sent1?.length || 0}`);
        console.log(`  - Unsent: ${unsent1?.length || 0}`);
        
        const { data: sent2 } = await supabase
            .from('whatsapp_invoice_notifications')
            .select('*', { count: 'exact', head: true })
            .not('sent_at', 'is', null);
        
        const { data: unsent2 } = await supabase
            .from('whatsapp_invoice_notifications')
            .select('*', { count: 'exact', head: true })
            .is('sent_at', null);
        
        console.log(`\nwhatsapp_invoice_notifications:`);
        console.log(`  - Sent: ${sent2?.length || 0}`);
        console.log(`  - Unsent: ${unsent2?.length || 0}`);
        
        console.log();
        
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

// Parse arguments
if (args.length === 0) {
    console.log(`
Usage:
  node backend/delete-whatsapp-messages.js [option]

Options:
  --all              Delete semua WhatsApp messages
  --sent             Delete hanya messages yang sudah sent
  --unsent           Delete hanya messages yang belum sent
  --old [days]       Delete messages lebih dari X hari lalu (contoh: --old 30)
  --stats            Tampilkan statistik pesan
  
Contoh:
  node backend/delete-whatsapp-messages.js --stats
  node backend/delete-whatsapp-messages.js --all
  node backend/delete-whatsapp-messages.js --old 30
    `);
} else if (args[0] === '--all') {
    deleteAllMessages();
} else if (args[0] === '--sent') {
    deleteSentMessages();
} else if (args[0] === '--unsent') {
    deleteUnsentMessages();
} else if (args[0] === '--old' && args[1]) {
    deleteOldMessages(args[1]);
} else if (args[0] === '--stats') {
    showStats();
} else {
    console.log('❌ Invalid option');
    console.log('Use: node backend/delete-whatsapp-messages.js --help');
}
