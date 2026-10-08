/**
 * Test Script - Generate Tokens Manually
 * Usage: node backend/test-token-generation.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');
const DailyTokenService = require('./daily-token-service');

async function testTokenGeneration() {
    console.log('\n[TEST] Starting manual token generation test...\n');

    // Initialize Supabase
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Initialize Token Service
    const tokenService = new DailyTokenService(
        supabase,
        process.env.RESEND_API_KEY,
        process.env.RESEND_FROM_EMAIL || 'noreply@arsipdigitalanka.my.id'
    );

    try {
        // Get all users with valid email
        console.log('[TEST] Fetching users with valid emails...');
        const { data: users, error: fetchError } = await supabase
            .from('users')
            .select('id, email, username, role')
            .not('email', 'is', null)
            .neq('email', '')
            .order('created_at', { ascending: false })
            .limit(10);

        if (fetchError) {
            console.error('[ERROR] Failed to fetch users:', fetchError);
            return;
        }

        console.log(`\n[TEST] Found ${users.length} users with valid emails:\n`);
        users.forEach((u, i) => {
            console.log(`  ${i + 1}. ${u.username || u.email} (${u.role}) - ${u.email}`);
        });

        // Ask which user to generate token for
        if (users.length === 0) {
            console.log('\n[ERROR] No users with valid email found!');
            console.log('Please create users and set their email addresses first.');
            return;
        }

        // Generate token for first user (for testing)
        const targetUser = users[0];
        console.log(`\n[TEST] Generating token for: ${targetUser.username || targetUser.email}\n`);

        // Create token
        const tokenResult = await tokenService.createDailyToken(targetUser.id, targetUser.email);
        
        if (!tokenResult.success) {
            console.error('[ERROR] Failed to create token:', tokenResult.error);
            return;
        }

        console.log(`[SUCCESS] Token created:\n`);
        console.log(`  Token ID: ${tokenResult.tokenId}`);
        console.log(`  Token: ${tokenResult.token}`);
        console.log(`  Expires At: ${tokenResult.expiresAt}`);

        // Send email
        console.log(`\n[TEST] Sending token via email to ${targetUser.email}...\n`);
        const emailResult = await tokenService.sendTokenEmail(
            targetUser.id,
            targetUser.email,
            tokenResult.token,
            targetUser.username
        );

        if (!emailResult.success) {
            console.error('[ERROR] Failed to send email:', emailResult.error);
            return;
        }

        console.log(`[SUCCESS] Email sent!\n`);
        console.log(`  Email ID: ${emailResult.emailId}`);
        console.log(`  Recipient: ${targetUser.email}`);
        console.log(`  Status: Check email inbox for verification code\n`);

        console.log('[TEST] ✅ Test completed successfully!\n');
        
        // Test stats
        console.log('[TEST] Getting token statistics...\n');
        const stats = await tokenService.getTokenStats();
        if (stats.success) {
            console.log('Token Stats:');
            console.log(`  Total Generated Today: ${stats.stats.totalGenerated}`);
            console.log(`  Total Used: ${stats.stats.totalUsed}`);
            console.log(`  Email Failed: ${stats.stats.emailFailed}`);
        }

        process.exit(0);

    } catch (error) {
        console.error('[ERROR] Exception during test:', error);
        process.exit(1);
    }
}

// Run test
testTokenGeneration();
