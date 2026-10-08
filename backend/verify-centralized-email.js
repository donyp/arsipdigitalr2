/**
 * Verify Centralized Email Configuration
 * Check that all super_admin & moderator tokens go to donisugiharto322@gmail.com
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyCentralizedEmail() {
    try {
        console.log('🔍 Verifying centralized email configuration...\n');

        // Check environment variable
        const adminEmail = process.env.ADMIN_TOKEN_EMAIL;
        console.log(`1️⃣ ADMIN_TOKEN_EMAIL env var: ${adminEmail}`);
        
        if (adminEmail !== 'donisugiharto322@gmail.com') {
            console.log(`   ⚠️ WARNING: Expected donisugiharto322@gmail.com, got ${adminEmail}`);
        } else {
            console.log(`   ✅ Correctly set to donisugiharto322@gmail.com`);
        }

        // Get all admin users
        console.log(`\n2️⃣ Checking admin users in database...`);
        const { data: admins, error: adminError } = await supabase
            .from('users')
            .select('id, email, name, role, is_active')
            .or(`role.eq.super_admin,role.eq.moderator`)
            .eq('is_active', true);

        if (adminError) {
            console.error(`   ❌ Error:`, adminError);
            process.exit(1);
        }

        console.log(`   Found ${admins.length} active admin/moderator users:`);
        admins.forEach(admin => {
            console.log(`      - ${admin.email} (${admin.name}) [${admin.role}]`);
        });

        // Check latest tokens
        console.log(`\n3️⃣ Checking latest daily tokens...`);
        const { data: tokens, error: tokenError } = await supabase
            .from('daily_login_tokens')
            .select('id, user_id, token, email_sent, created_at')
            .order('created_at', { ascending: false })
            .limit(10);

        if (tokenError) {
            console.error(`   ❌ Error:`, tokenError);
            process.exit(1);
        }

        console.log(`   Latest ${tokens.length} tokens:`);
        for (const t of tokens) {
            const admin = admins.find(a => a.id === t.user_id);
            const userName = admin ? `${admin.name} (${admin.email})` : `Unknown (${t.user_id})`;
            const status = t.email_sent ? '✅ Sent' : '❌ Not sent';
            console.log(`      - ${userName}: ${t.token} [${status}]`);
        }

        // Summary
        console.log(`\n4️⃣ Configuration Summary:`);
        console.log(`   - Centralized email: ${adminEmail}`);
        console.log(`   - Active admins: ${admins.length}`);
        console.log(`   - ENABLE_DAILY_TOKEN_AUTH: ${process.env.ENABLE_DAILY_TOKEN_AUTH}`);
        
        if (process.env.ENABLE_DAILY_TOKEN_AUTH === 'true' && admins.length > 0) {
            console.log(`\n✅ System is ready! All admin tokens will be sent to ${adminEmail}`);
        } else {
            console.log(`\n⚠️ Check configuration - may need to enable daily token auth`);
        }

    } catch (error) {
        console.error(`\n❌ Error:`, error.message);
        process.exit(1);
    }
}

verifyCentralizedEmail();
