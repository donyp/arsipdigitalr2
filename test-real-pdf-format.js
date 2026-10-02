#!/usr/bin/env node

// Test with ACTUAL PDF-extracted format
// Based on the real PDF you provided

// This is how pdf-parse likely extracts the BCA lines:
const realPdfLines = [
    // Page 1 line from PDF
    "08/06 SETORAN TUNAI 7510 100,000,000.00 109,161,912.00",
    "SETOR TUNAI",
    "",
    "08/06 TRSF E-BANKING DB 0806/FTSCY/WS95051 23,625,000.00 DB",
    " 23625000.00",
    "GG2303033",
    "NATURAL INSULATION",
    "",
    "09/06 SETORAN TUNAI 7510 88,000,000.00",
    "SETOR TUNAI",
    "",
    "09/06 TRSF E-BANKING DB 0906/FTSCY/WS95051 35,440,036.00 DB",
    " 35440036.00",
    "005236",
    "MEGA ERA NASIONAL",
    "",
    // Page 2 line from PDF
    "22/06 SETORAN TUNAI 7510 7,363,884.00 8,243,931.00",
    "SETOR TUNAI",
    "",
    "30/06 BIAYA ADM 30,000.00 DB 8,213,931.00",
];

console.log('🔍 Analyzing actual PDF-extracted lines\n');

realPdfLines.forEach((line, idx) => {
    if (!line.trim()) return;
    
    console.log(`Line ${idx}: "${line}"`);
    
    // Check if it's a transaction line (starts with DD/MM)
    const dateMatch = line.match(/^(\d{2}\/\d{2})(.*)/);
    if (dateMatch) {
        const [, date, rest] = dateMatch;
        console.log(`  → Date: ${date}`);
        console.log(`  → Rest: "${rest}"`);
        
        // Try to find moneys
        const moneyMatches = rest.match(/(\d{1,3}(?:,\d{3})*\.\d{2})/g);
        if (moneyMatches) {
            console.log(`  → Found moneys:`, moneyMatches);
        }
        
        // Check for 4-digit codes
        const codeMatches = rest.match(/\b(\d{4})\b/g);
        if (codeMatches) {
            console.log(`  → Found 4-digit codes:`, codeMatches);
        }
    }
    console.log();
});

console.log('\n=== PROBLEM ANALYSIS ===\n');

console.log('For line: "22/06 SETORAN TUNAI 7510 7,363,884.00 8,243,931.00"');
console.log('Expected output:');
console.log('  tgl: 22/06');
console.log('  kredit: 7,363,884.00');
console.log('  saldo: 8,243,931.00');
console.log('  ket: SETORAN TUNAI SETOR TUNAI');
console.log();
console.log('Actual CSV output:');
console.log('  tgl: 22/06 ✓');
console.log('  kredit: 107,363,884.00 ✗ (should be 7,363,884.00)');
console.log('  saldo: 8,243,931.00 ✓');
console.log('  ket: SETORAN TUNAI75 SETOR TUNAI ✗ (should be SETORAN TUNAI SETOR TUNAI)');
console.log();
console.log('Issue: 7510 is being PARTIALLY included in kredit amount!');
console.log('  7510 + 7,363,884.00 = ???');
console.log('  Somehow becoming: 107,363,884.00');
console.log();
console.log('Theory: Maybe the "7510" is being treated as leading digits?');
console.log('  If we take "7" + "1" + "0" = "710", then "7,363,884.00"');
console.log('  Combined: "710" + ",363,884.00"? No, that doesn\'t work.');
console.log();
console.log('Better theory: Money extraction is grabbing "7510" + "7,363,884" + "??"');
console.log('  Need to see what extractTrailingMoney actually receives!');
