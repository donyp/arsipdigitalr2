/**
 * Script untuk menambahkan device restriction ke semua HTML files
 * Run: node add-device-restriction.js
 */

const fs = require('fs');
const path = require('path');

const HTML_FILES = [
    'dashboard-admin-zona.html',
    'dashboard-moderator.html',
    'upload-excel.html',
    'upload-invoice-pdf.html',
    'upload-bukti-bayar.html',
    'upload-faktur-pajak.html',
    'rename-faktur.html',
    'users.html',
    'tokos.html',
    'zonas.html',
    'audit-logs.html',
    'support-dashboard.html',
    'support-dashboard-customer.html',
    'support-ticket-detail.html',
    'support-ticket-detail-moderator.html'
];

const DEVICE_SCRIPT = '<script src="js/device-restriction.js"></script>';

HTML_FILES.forEach(file => {
    const filepath = path.join(__dirname, file);
    
    if (!fs.existsSync(filepath)) {
        console.log(`⏭️  Skip: ${file} (not found)`);
        return;
    }

    let content = fs.readFileSync(filepath, 'utf8');
    
    // Check if already has device restriction
    if (content.includes('device-restriction.js')) {
        console.log(`✅ Skip: ${file} (already has device restriction)`);
        return;
    }

    // Find <head> tag and inject script right after
    const headMatch = content.match(/(<head[^>]*>)/i);
    
    if (!headMatch) {
        console.log(`❌ Error: ${file} (no <head> tag found)`);
        return;
    }

    // Insert device restriction script after <head>
    const injection = `${headMatch[1]}\n    <!-- DEVICE RESTRICTION - Load FIRST before anything else -->\n    ${DEVICE_SCRIPT}\n    `;
    
    content = content.replace(headMatch[1], injection);
    
    // Write back
    fs.writeFileSync(filepath, content, 'utf8');
    console.log(`✅ Added: ${file}`);
});

console.log('\n✨ Device restriction added to all HTML files!');
