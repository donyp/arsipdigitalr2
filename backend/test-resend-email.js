#!/usr/bin/env node
/**
 * Test Resend Email Configuration
 * Tests if RESEND_API_KEY is valid and if email can be sent
 */

require('dotenv').config();
const { Resend } = require('resend');

async function testResendEmail() {
    console.log('\n=== TESTING RESEND EMAIL CONFIGURATION ===\n');

    // 1. Check API Key
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const toEmail = process.argv[2] || 'donisugiharto@megagroupindonesia.co.id'; // Allow override via CLI

    console.log('1. Environment Variables:');
    console.log(`   RESEND_API_KEY: ${apiKey ? (apiKey.substring(0, 10) + '...') : 'NOT SET'}`);
    console.log(`   RESEND_FROM_EMAIL: ${fromEmail || 'NOT SET'}`);
    console.log(`   TO_EMAIL: ${toEmail}`);

    if (!apiKey) {
        console.error('\n❌ ERROR: RESEND_API_KEY is not set in .env');
        process.exit(1);
    }

    if (!fromEmail) {
        console.error('\n❌ ERROR: RESEND_FROM_EMAIL is not set in .env');
        process.exit(1);
    }

    // 2. Initialize Resend
    console.log('\n2. Initializing Resend client...');
    let resend;
    try {
        resend = new Resend(apiKey);
        console.log('   ✅ Resend client initialized');
    } catch (error) {
        console.error(`   ❌ Failed to initialize Resend: ${error.message}`);
        process.exit(1);
    }

    // 3. Test Send Email
    console.log('\n3. Sending test email...');
    try {
        const { data, error } = await resend.emails.send({
            from: fromEmail,
            to: toEmail,
            subject: '🔐 Test Token - Arsip Digital Anka',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2>Test Email dari Resend</h2>
                    <p>Kode akses login: <strong>12345</strong></p>
                    <p>Email ini dikirim dari: ${fromEmail}</p>
                    <p>Waktu: ${new Date().toISOString()}</p>
                    <p style="color: #666; font-size: 12px; margin-top: 30px;">
                        Ini adalah email test untuk debugging Resend configuration.
                    </p>
                </div>
            `
        });

        if (error) {
            console.error(`   ❌ ERROR: ${error.message}`);
            console.error(`   Full error: ${JSON.stringify(error, null, 2)}`);
            process.exit(1);
        }

        if (data) {
            console.log(`   ✅ Email sent successfully!`);
            console.log(`   Email ID: ${data.id}`);
            console.log(`   From: ${fromEmail}`);
            console.log(`   To: ${toEmail}`);
            console.log('\n✅ ALL TESTS PASSED - Resend is configured correctly!\n');
            process.exit(0);
        }

    } catch (error) {
        console.error(`   ❌ EXCEPTION: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

testResendEmail();
