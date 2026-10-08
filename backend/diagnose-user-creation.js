/**
 * Diagnose User Creation Issue
 * Check if users created via UI are actually saved in public.users table
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function diagnoseUserCreation() {
    try {
        console.log('🔍 Diagnosing user creation issue...\n');

        // 1. Check auth.users (from Supabase Auth)
        console.log('1️⃣ Checking Supabase Auth (auth.users):');
        const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
        
        if (authError) {
            console.error('❌ Error fetching auth users:', authError.message);
        } else {
            console.log(`   ✅ Found ${authUsers.users.length} users in auth.users`);
            authUsers.users.forEach(u => {
                console.log(`      - ${u.email} (${u.id})`);
            });
        }

        // 2. Check public.users table
        console.log('\n2️⃣ Checking public.users table:');
        const { data: dbUsers, error: dbError } = await supabase
            .from('users')
            .select('id, email, name, role, is_active, created_at');

        if (dbError) {
            console.error('❌ Error fetching database users:', dbError.message);
        } else {
            console.log(`   ✅ Found ${(dbUsers || []).length} users in public.users`);
            (dbUsers || []).forEach(u => {
                console.log(`      - ${u.email} (${u.id}) [${u.role}] [${u.name}] [active: ${u.is_active}]`);
            });
        }

        // 3. Compare: auth.users vs public.users
        console.log('\n3️⃣ Comparison:');
        const authEmails = new Set(authUsers.users.map(u => u.email));
        const dbEmails = new Set((dbUsers || []).map(u => u.email));

        const inAuthNotInDb = [...authEmails].filter(email => !dbEmails.has(email));
        const inDbNotInAuth = [...dbEmails].filter(email => !authEmails.has(email));

        if (inAuthNotInDb.length > 0) {
            console.log(`   ⚠️ In auth.users but NOT in public.users (${inAuthNotInDb.length}):`);
            inAuthNotInDb.forEach(email => {
                console.log(`      - ${email}`);
            });
        } else {
            console.log(`   ✅ All auth.users are present in public.users`);
        }

        if (inDbNotInAuth.length > 0) {
            console.log(`   ⚠️ In public.users but NOT in auth.users (${inDbNotInAuth.length}):`);
            inDbNotInAuth.forEach(email => {
                console.log(`      - ${email}`);
            });
        }

        // 4. Check daily_login_tokens
        console.log('\n4️⃣ Checking daily_login_tokens:');
        const { data: tokens, error: tokenError } = await supabase
            .from('daily_login_tokens')
            .select('id, user_id, token, created_at, expires_at, email_sent')
            .order('created_at', { ascending: false });

        if (tokenError) {
            console.error('❌ Error fetching tokens:', tokenError.message);
        } else {
            console.log(`   ✅ Found ${(tokens || []).length} tokens`);
            (tokens || []).slice(0, 5).forEach(t => {
                console.log(`      - User ${t.user_id}: ${t.token} (sent: ${t.email_sent}) [${t.created_at}]`);
            });
        }

        // 5. Summary
        console.log('\n📊 SUMMARY:');
        console.log(`   - Auth users: ${authUsers.users.length}`);
        console.log(`   - DB users: ${(dbUsers || []).length}`);
        console.log(`   - Daily tokens: ${(tokens || []).length}`);
        console.log(`   - Mismatch: ${inAuthNotInDb.length} users in auth but not in DB`);

        if (inAuthNotInDb.length > 0) {
            console.log(`\n❌ ISSUE IDENTIFIED: Users exist in auth.users but not in public.users!`);
            console.log(`   This explains why tokens are not being generated.`);
            console.log(`\n   SOLUTION: Ensure POST /api/users endpoint successfully inserts into public.users table.`);
        } else {
            console.log(`\n✅ No synchronization issues found.`);
        }

    } catch (error) {
        console.error('❌ Unexpected error:', error);
    }
}

diagnoseUserCreation();
