/**
 * Test script: Preview the bulk admin email template
 * Shows what the moderator/super_admin consolidated email looks like
 */

require('dotenv').config();
const DailyTokenService = require('./daily-token-service');

const mockTokens = [
    {
        userId: '1',
        userName: 'Doni Sugiharto',
        userEmail: 'donisugiharto322@gmail.com',
        token: '12345',
        role: 'moderator'
    },
    {
        userId: '2',
        userName: 'Budi Admin',
        userEmail: 'budi@example.com',
        token: '67890',
        role: 'super_admin'
    },
    {
        userId: '3',
        userName: 'Andi Moderator',
        userEmail: 'andi@example.com',
        token: '54321',
        role: 'moderator'
    }
];

// Create a mock supabase client
const mockSupabase = {
    from: () => ({
        update: () => ({ eq: () => Promise.resolve({ error: null }) })
    })
};

const service = new DailyTokenService(
    mockSupabase,
    're_fake_key_for_preview',
    'noreply@arsipdigitalanka.my.id',
    'donisugiharto322@gmail.com'
);

// Build the HTML manually to preview
let tokenTableHTML = '';
mockTokens.forEach((token, index) => {
    const roleLabel = token.role === 'super_admin' ? '👑 Super Admin' : '⚙️ Moderator';
    tokenTableHTML += `
                    <tr style="border-bottom: 1px solid #e0e0e0;">
                        <td style="padding: 12px; text-align: center; color: #667eea; font-weight: 600;">${index + 1}</td>
                        <td style="padding: 12px;"><strong>${token.userName}</strong><br><span style="font-size: 12px; color: #999;">${token.userEmail}</span></td>
                        <td style="padding: 12px; text-align: center; color: #666;">${roleLabel}</td>
                        <td style="padding: 12px; text-align: center; font-family: 'Courier New', monospace; font-size: 16px; font-weight: 700; letter-spacing: 2px; color: #667eea;">${token.token}</td>
                    </tr>
                `;
});

const htmlContent = `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tokens Harian Admin</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 30px;
            text-align: center;
            color: white;
        }
        .header-logo {
            display: inline-block;
            width: 50px;
            height: 50px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 15px;
            font-size: 28px;
        }
        .header h1 {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 5px;
            letter-spacing: -0.5px;
        }
        .header p {
            font-size: 14px;
            opacity: 0.9;
        }
        .content {
            padding: 40px 30px;
        }
        .greeting {
            font-size: 16px;
            color: #333;
            margin-bottom: 10px;
            line-height: 1.5;
        }
        .greeting strong { color: #667eea; }
        .description {
            font-size: 14px;
            color: #666;
            line-height: 1.6;
            margin-bottom: 30px;
        }
        .tokens-section {
            margin: 30px 0;
            border-radius: 12px;
            overflow: hidden;
            border: 2px solid #667eea;
            background: #f8f9ff;
        }
        .tokens-section-title {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 20px;
            font-weight: 600;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .tokens-table {
            width: 100%;
            border-collapse: collapse;
            background: white;
        }
        .tokens-table thead {
            background: #f0f4ff;
            border-bottom: 2px solid #e0e0e0;
        }
        .tokens-table th {
            padding: 15px;
            text-align: left;
            font-weight: 600;
            color: #667eea;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .tokens-table td {
            padding: 12px 15px;
        }
        .info-box {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 4px;
        }
        .info-box .title {
            font-weight: 600;
            color: #667eea;
            margin-bottom: 8px;
            font-size: 14px;
        }
        .info-box ul {
            list-style: none;
            font-size: 13px;
            color: #555;
            line-height: 1.8;
        }
        .info-box li {
            margin-bottom: 5px;
            padding-left: 20px;
            position: relative;
        }
        .info-box li:before {
            content: "✓";
            position: absolute;
            left: 0;
            color: #667eea;
            font-weight: bold;
        }
        .footer {
            background: #f8f9fa;
            padding: 20px 30px;
            text-align: center;
            border-top: 1px solid #eee;
        }
        .footer p {
            font-size: 12px;
            color: #999;
            margin: 5px 0;
            line-height: 1.5;
        }
        .footer-logo {
            display: inline-block;
            font-weight: 700;
            color: #667eea;
            font-size: 14px;
            margin-top: 10px;
        }
        .summary-box {
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%);
            border: 2px solid #e0e0e0;
            border-radius: 12px;
            padding: 15px;
            margin-bottom: 20px;
            text-align: center;
        }
        .summary-box .count {
            font-size: 32px;
            font-weight: 700;
            color: #667eea;
            margin-bottom: 5px;
        }
        .summary-box .label {
            font-size: 13px;
            color: #666;
            font-weight: 500;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="header-logo">🔐</div>
            <h1>Tokens Harian Admin</h1>
            <p>Arsip Digital Anka - Laporan Akses Harian</p>
        </div>

        <!-- Content -->
        <div class="content">
            <!-- Greeting -->
            <div class="greeting">
                Halo <strong>Tim Admin</strong>,
            </div>
            
            <div class="description">
                Berikut adalah kode akses login harian untuk semua user dengan role <strong>Super Admin</strong> dan <strong>Moderator</strong>. Kode ini berlaku selama 24 jam.
            </div>

            <!-- Summary -->
            <div class="summary-box">
                <div class="count">${mockTokens.length}</div>
                <div class="label">User dengan token baru</div>
            </div>

            <!-- Tokens Table -->
            <div class="tokens-section">
                <div class="tokens-section-title">📋 Daftar Token Harian</div>
                <table class="tokens-table">
                    <thead>
                        <tr>
                            <th style="width: 50px;">No</th>
                            <th>Pengguna</th>
                            <th>Role</th>
                            <th>Kode Token</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tokenTableHTML}
                    </tbody>
                </table>
            </div>

            <!-- Info -->
            <div class="info-box">
                <div class="title">ℹ️ Informasi Penting</div>
                <ul>
                    <li>Setiap kode berlaku selama 24 jam ke depan</li>
                    <li>Kode baru akan dikirim otomatis setiap hari jam 04:00</li>
                    <li>Sistem akan melakukan logout otomatis setiap hari jam 00:00</li>
                    <li>Email ini berisi informasi sensitif - jaga kerahasiaannya</li>
                </ul>
            </div>
        </div>

        <!-- Footer -->
        <div class="footer">
            <p>Email ini dikirim otomatis oleh sistem admin panel</p>
            <p>© ${new Date().getFullYear()} <span class="footer-logo">Arsip Digital Anka</span></p>
            <p style="margin-top: 8px; font-size: 11px;">Waktu pengiriman: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</p>
        </div>
    </div>
</body>
</html>
`;

// Save to file for preview
const fs = require('fs');
fs.writeFileSync('email-preview.html', htmlContent);

console.log('✅ Email preview saved to: email-preview.html');
console.log('   You can open this in a browser to see the fancy design');
console.log(`\n📧 Email will be sent to: donisugiharto322@gmail.com`);
console.log(`📋 Contains tokens for ${mockTokens.length} users (super_admin & moderator)`);
console.log('\n🎨 Features:');
console.log('   ✓ Modern gradient header (purple & blue)');
console.log('   ✓ Fancy token display with table');
console.log('   ✓ Clean, professional layout');
console.log('   ✓ Role badges (👑 Super Admin, ⚙️ Moderator)');
console.log('   ✓ Responsive design for mobile');
