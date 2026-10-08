/**
 * Generate a fresh token for moderator user
 * This creates a new token and logs it to console
 */

require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');
const DailyTokenService = require('./daily-token-service');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function generateFreshToken() {
    try {
        console.log('🔄 Generating fresh token for moderator...\n');

        // Initialize token service
        const tokenService = new DailyTokenService(
            supabase,
            process.env.RESEND_API_KEY,
            process.env.RESEND_FROM_EMAIL || 'noreply@arsipdigitalanka.my.id',
            process.env.ADMIN_TOKEN_EMAIL
        );

        // Get moderator user
        const { data: users } = await supabase
            .from('users')
            .select('id, username, email, role')
            .eq('username', 'moderator')
            .single();

        if (!users) {
            console.log('❌ Moderator user not found');
            return;
        }

        console.log(`✅ Found user: ${users.username}`);
        console.log(`   Email: ${users.email}`);
        console.log(`   Role: ${users.role}\n`);

        // Generate token
        console.log('📝 Creating new token...');
        const tokenResult = await tokenService.createDailyToken(users.id, users.email);

        if (!tokenResult.success) {
            console.log(`❌ Failed to create token: ${tokenResult.error}`);
            return;
        }

        console.log(`✅ Token created: ${tokenResult.token}`);
        console.log(`   Token ID: ${tokenResult.tokenId}`);
        console.log(`   Expires at: ${tokenResult.expiresAt}\n`);

        // Send email
        console.log('📨 Sending email...');
        const emailResult = await tokenService.sendTokenEmail(
            users.id,
            users.email,
            tokenResult.token,
            users.username,
            users.role
        );

        if (emailResult.success) {
            console.log(`✅ Email sent successfully`);
            console.log(`   Email ID: ${emailResult.emailId}`);
        } else {
            console.log(`⚠️  Email sending failed: ${emailResult.error}`);
            console.log(`   But token was created: ${tokenResult.token}`);
        }

        console.log(`\n${'='.repeat(60)}`);
        console.log(`🔑 NEW TOKEN FOR MODERATOR:`);
        console.log(`   Token: ${tokenResult.token}`);
        console.log(`${'='.repeat(60)}`);
        console.log(`\n📝 Use this token to login at: https://arsipdigitalanka.my.id`);

    } catch (error) {
        console.error('Exception:', error);
    }
}

generateFreshToken();
