/**
 * Debug: Test centralized email with logging
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const DailyTokenService = require('./daily-token-service');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testCentralizedDebug() {
    try {
        console.log('🧪 Testing centralized email with debug logging...\n');

        // Create service with explicit admin email
        const dailyTokenService = new DailyTokenService(
            supabase,
            process.env.RESEND_API_KEY,
            process.env.RESEND_FROM_EMAIL,
            process.env.ADMIN_TOKEN_EMAIL
        );

        console.log(`Service initialized with adminTokenEmail: ${process.env.ADMIN_TOKEN_EMAIL}\n`);

        // Trigger generation
        const result = await dailyTokenService.generateAndSendDailyTokens();

        console.log('\n📊 Result:');
        console.log(`   Generated: ${result.generated}`);
        console.log(`   Sent: ${result.sent}`);
        console.log(`   Total: ${result.total}`);

        if (result.results) {
            console.log('\n📋 Details:');
            result.results.forEach(r => {
                console.log(`   - ${r.email} (${r.role}): ${r.status}`);
            });
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testCentralizedDebug();
