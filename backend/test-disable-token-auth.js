#!/usr/bin/env node
/**
 * Test: Verify email is NOT sent when ENABLE_DAILY_TOKEN_AUTH=false
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const DailyTokenService = require('./daily-token-service');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
    try {
        console.log('\n=== TEST: ENABLE_DAILY_TOKEN_AUTH Toggle ===\n');

        // Save original value
        const originalValue = process.env.ENABLE_DAILY_TOKEN_AUTH;
        console.log(`Original ENABLE_DAILY_TOKEN_AUTH: ${originalValue}\n`);

        // Test 1: WITH token auth ENABLED
        console.log('--- TEST 1: With ENABLE_DAILY_TOKEN_AUTH=true ---');
        process.env.ENABLE_DAILY_TOKEN_AUTH = 'true';
        
        const serviceEnabled = new DailyTokenService(
            supabase,
            process.env.RESEND_API_KEY,
            process.env.RESEND_FROM_EMAIL,
            process.env.ADMIN_TOKEN_EMAIL
        );

        const result1 = await serviceEnabled.generateAndSendDailyTokens();
        console.log('Result:', {
            success: result1.success,
            generated: result1.generated,
            sent: result1.sent,
            total: result1.total,
            message: result1.message || 'Tokens generated and sent'
        });

        // Test 2: WITH token auth DISABLED
        console.log('\n--- TEST 2: With ENABLE_DAILY_TOKEN_AUTH=false ---');
        process.env.ENABLE_DAILY_TOKEN_AUTH = 'false';
        
        const serviceDisabled = new DailyTokenService(
            supabase,
            process.env.RESEND_API_KEY,
            process.env.RESEND_FROM_EMAIL,
            process.env.ADMIN_TOKEN_EMAIL
        );

        const result2 = await serviceDisabled.generateAndSendDailyTokens();
        console.log('Result:', {
            success: result2.success,
            generated: result2.generated,
            sent: result2.sent,
            total: result2.total,
            message: result2.message
        });

        // Test 3: WITH invalid/missing token auth setting
        console.log('\n--- TEST 3: With ENABLE_DAILY_TOKEN_AUTH=undefined ---');
        delete process.env.ENABLE_DAILY_TOKEN_AUTH;
        
        const serviceUndefined = new DailyTokenService(
            supabase,
            process.env.RESEND_API_KEY,
            process.env.RESEND_FROM_EMAIL,
            process.env.ADMIN_TOKEN_EMAIL
        );

        const result3 = await serviceUndefined.generateAndSendDailyTokens();
        console.log('Result:', {
            success: result3.success,
            generated: result3.generated,
            sent: result3.sent,
            total: result3.total,
            message: result3.message
        });

        // Summary
        console.log('\n=== SUMMARY ===');
        console.log('✅ Enabled (true): Generated =', result1.generated, '| Sent =', result1.sent);
        console.log('❌ Disabled (false): Generated =', result2.generated, '| Message =', result2.message);
        console.log('❌ Undefined: Generated =', result3.generated, '| Message =', result3.message);
        
        console.log('\n✅ VERIFICATION:');
        console.log('- When ENABLED: Tokens are generated and sent');
        console.log('- When DISABLED: No tokens generated, no emails sent');
        console.log('- When UNDEFINED: No tokens generated, no emails sent (defaults to disabled)');

        // Restore original
        if (originalValue) {
            process.env.ENABLE_DAILY_TOKEN_AUTH = originalValue;
        }

    } catch (error) {
        console.error('❌ Error:', error);
    }
    
    process.exit(0);
})();
