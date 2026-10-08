/**
 * Debug script: Check what tokens exist in database for a specific user
 * Usage: node debug-token-lookup.js <userId>
 */

require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugTokenLookup() {
    try {
        // Get the moderator user ID
        console.log('🔍 Looking for moderator user...');
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('id, username, email, role')
            .eq('username', 'moderator');

        if (userError) {
            console.error('Error fetching user:', userError);
            return;
        }

        if (!users || users.length === 0) {
            console.log('❌ Moderator user not found');
            return;
        }

        const user = users[0];
        console.log(`✅ Found user: ${user.username} (ID: ${user.id})`);
        console.log(`   Email: ${user.email}, Role: ${user.role}\n`);

        // Get all tokens for this user
        console.log('📋 Tokens for this user:');
        const { data: tokens, error: tokenError } = await supabase
            .from('daily_login_tokens')
            .select('id, user_id, token, created_at, expires_at, is_used, is_locked, token_attempts')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (tokenError) {
            console.error('Error fetching tokens:', tokenError);
            return;
        }

        if (!tokens || tokens.length === 0) {
            console.log('❌ No tokens found for this user');
            return;
        }

        console.log(`Found ${tokens.length} token(s):\n`);
        tokens.forEach((t, idx) => {
            const now = new Date();
            const expiry = new Date(t.expires_at);
            const isExpired = now > expiry ? 'EXPIRED ❌' : 'VALID ✅';
            
            console.log(`${idx + 1}. Token: ${t.token}`);
            console.log(`   ID: ${t.id}`);
            console.log(`   Created: ${t.created_at}`);
            console.log(`   Expires: ${t.expires_at} (${isExpired})`);
            console.log(`   Used: ${t.is_used}, Locked: ${t.is_locked}, Attempts: ${t.token_attempts}`);
            console.log();
        });

        // Now try to look up a specific token (the one user tried)
        console.log('🔎 Attempting to look up token 41529...');
        const now = new Date();
        const { data: specificToken, error: lookupError } = await supabase
            .from('daily_login_tokens')
            .select('*')
            .eq('user_id', user.id)
            .eq('token', '41529')
            .gt('expires_at', now.toISOString())
            .single();

        if (lookupError) {
            console.log(`❌ Lookup failed: ${lookupError.message}`);
            console.log(`   Error code: ${lookupError.code}`);
            console.log(`   Error details:`, lookupError);
        } else if (specificToken) {
            console.log(`✅ Token 41529 found!`);
            console.log(`   Token record:`, specificToken);
        } else {
            console.log('❌ Token 41529 not found (no error, but no data)');
        }

    } catch (error) {
        console.error('Exception:', error);
    }
}

debugTokenLookup();
