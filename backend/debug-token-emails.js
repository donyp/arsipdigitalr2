#!/usr/bin/env node
/**
 * Debug why emails are not sent
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
    try {
        console.log('\n=== DEBUG: TOKEN EMAIL STATUS ===\n');

        // Get all tokens with user info
        const { data: tokens } = await supabase
            .from('daily_login_tokens')
            .select('*')
            .order('created_at', { ascending: false });

        const { data: users } = await supabase
            .from('users')
            .select('id, email, name, role');

        console.log('ALL TOKENS:');
        console.log('─'.repeat(80));
        
        tokens.forEach((t, i) => {
            const user = users.find(u => u.id === t.user_id);
            console.log(`Token ${i+1}:`);
            console.log(`  User: ${user?.name || 'Unknown'} (${user?.email})`);
            console.log(`  Role: ${user?.role}`);
            console.log(`  Token: ${t.token}`);
            console.log(`  Email Address: ${t.email_address}`);
            console.log(`  Email Sent: ${t.email_sent ? '✅ YES' : '❌ NO'}`);
            console.log(`  Created: ${t.created_at}`);
            console.log('');
        });

        // Summary
        console.log('─'.repeat(80));
        console.log('SUMMARY:');
        const sent = tokens.filter(t => t.email_sent).length;
        const notSent = tokens.filter(t => !t.email_sent).length;
        console.log(`  Total Tokens: ${tokens.length}`);
        console.log(`  Sent: ${sent}`);
        console.log(`  NOT Sent: ${notSent}`);

        if (notSent > 0) {
            console.log('\nPROBLEM: Some emails not sent!');
            console.log('Check email_address field - might be wrong or missing.');
        }

    } catch (error) {
        console.error('Error:', error);
    }

    process.exit(0);
})();
