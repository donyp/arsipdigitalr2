#!/usr/bin/env node
/**
 * Test sending token email via Resend
 */

require('dotenv').config();
const { Resend } = require('resend');

async function test() {
    console.log('\n=== TESTING TOKEN EMAIL SEND ===\n');

    try {
        // Check API key
        const apiKey = process.env.RESEND_API_KEY;
        const fromEmail = process.env.RESEND_FROM_EMAIL;

        console.log('1️⃣  Checking configuration...');
        console.log(`   API Key: ${apiKey ? (apiKey.substring(0, 10) + '...') : 'NOT SET'}`);
        console.log(`   From Email: ${fromEmail || 'NOT SET'}`);

        if (!apiKey || !fromEmail) {
            console.error('❌ Missing configuration');
            process.exit(1);
        }

        // Initialize Resend
        console.log('\n2️⃣  Initializing Resend...');
        const resend = new Resend(apiKey);
        console.log('   ✅ Resend initialized');

        // Test data
        const token = '69577'; // Token from previous test
        const toEmail = 'donisugiharto322@gmail.com'; // Moderator email (the correct one!)
        const userName = 'Moderator';

        console.log(`\n3️⃣  Sending token email...`);
        console.log(`   To: ${toEmail}`);
        console.log(`   Token: ${token}`);

        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .header h2 { color: #333; margin: 0 0 10px 0; }
        .token-box { 
            background-color: #f0f4ff; 
            border-left: 4px solid #4CAF50; 
            padding: 20px; 
            margin: 20px 0; 
            text-align: center;
            border-radius: 4px;
        }
        .token-display { 
            font-size: 32px; 
            font-weight: bold; 
            color: #4CAF50; 
            letter-spacing: 5px;
            font-family: 'Courier New', monospace;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>🔐 Kode Akses Login Harian</h2>
            <p style="color: #999; margin: 5px 0;">Arsip Digital Anka</p>
        </div>
        
        <div style="color: #333; line-height: 1.6;">
            <p>Halo <strong>${userName}</strong>,</p>
            <p>Berikut adalah kode akses login harian Anda:</p>
            
            <div class="token-box">
                <p style="margin: 0 0 10px 0; color: #666;">Kode Akses (5 Digit)</p>
                <div class="token-display">${token}</div>
                <p style="margin: 10px 0 0 0; color: #666;">Berlaku 24 jam</p>
            </div>

            <p>Jika Anda mengalami kesulitan, hubungi tim support kami.</p>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center;">
            <p>© 2026 Arsip Digital Anka. Email ini dikirim otomatis.</p>
        </div>
    </div>
</body>
</html>
        `;

        const { data, error } = await resend.emails.send({
            from: fromEmail,
            to: toEmail,
            subject: 'Kode Akses Login Harian Arsip Digital Anka',
            html: htmlContent
        });

        if (error) {
            console.error(`   ❌ ERROR: ${error.message}`);
            console.error('   Full error:', error);
            process.exit(1);
        }

        if (data) {
            console.log(`\n   ✅ Email sent successfully!`);
            console.log(`   Email ID: ${data.id}`);
            console.log(`   From: ${fromEmail}`);
            console.log(`   To: ${toEmail}`);
            console.log(`\n✅ TEST PASSED!\n`);
            console.log('Email should arrive within seconds.');
            console.log(`Check inbox: ${toEmail}\n`);
            process.exit(0);
        }

    } catch (error) {
        console.error('❌ Exception:', error.message);
        console.error(error);
        process.exit(1);
    }
}

test();
