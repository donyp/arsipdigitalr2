#!/usr/bin/env node
/**
 * Test token generation with ENABLE_DAILY_TOKEN_AUTH check
 * Tests both enabled and disabled scenarios
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const DailyTokenService = require('./daily-token-service');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const dailyTokenService = new DailyTokenService(
    supabase,
    process.env.RESEND_API_KEY,
    process.env.RESEND_FROM_EMAIL,
    process.env.ADMIN_TOKEN_EMAIL
);

(async () => {
    try {
        console.log('\n=== TEST 1: Check Environment ===');
        console.log(`ENABLE_DAILY_TOKEN_AUTH: ${process.env.ENABLE_DAILY_TOKEN_AUTH}`);
        console.log(`RESEND_API_KEY: ${process.env.RESEND_API_KEY ? '✅ Set' : '❌ Not set'}`);
        console.log(`ADMIN_TOKEN_EMAIL: ${process.env.ADMIN_TOKEN_EMAIL}`);

        console.log('\n=== TEST 2: Generate Tokens (Current Setting) ===');
        const result = await dailyTokenService.generateAndSendDailyTokens();
        console.log('\nResult:', JSON.stringify(result, null, 2));

        if (result.results && result.results.length > 0) {
            console.log('\n=== User Details ===');
            result.results.forEach((r, idx) => {
                console.log(`\n${idx + 1}. ${r.name || r.email}`);
                console.log(`   Email: ${r.email}`);
                console.log(`   Role: ${r.role}`);
                console.log(`   Status: ${r.status}`);
                if (r.token) console.log(`   Token: ${r.token}`);
            });
        }

        console.log('\n=== Summary ===');
        console.log(`✅ Generated: ${result.generated}`);
        console.log(`✅ Sent: ${result.sent}`);
        console.log(`📊 Total: ${result.total}`);

    } catch (error) {
        console.error('❌ Error:', error);
    }
    
    process.exit(0);
})();
