/**
 * Reset moderator's current token to allow re-verification
 * This deletes the current token so a new one can be generated
 */

require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function resetToken() {
    try {
        console.log('🔄 Resetting moderator token...\n');

        // Get moderator user
        const { data: users } = await supabase
            .from('users')
            .select('id, username')
            .eq('username', 'moderator')
            .single();

        if (!users) {
            console.log('❌ Moderator user not found');
            return;
        }

        console.log(`✅ Found moderator: ${users.username} (ID: ${users.id})`);

        // Delete all tokens for this user
        const { data, error } = await supabase
            .from('daily_login_tokens')
            .delete()
            .eq('user_id', users.id);

        if (error) {
            console.log(`❌ Error deleting tokens: ${error.message}`);
            return;
        }

        console.log(`✅ Deleted all tokens for moderator`);
        console.log(`\n📝 Next steps:`);
        console.log(`   1. Go to token management page or call POST /api/auth/generate-tokens-now`);
        console.log(`   2. New token will be generated and sent to email`);
        console.log(`   3. Try login again with the new token`);

    } catch (error) {
        console.error('Exception:', error);
    }
}

resetToken();
