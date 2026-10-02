#!/usr/bin/env node

// Simplified debug to understand extractTrailingMoney failure

function extractTrailingMoney(s) {
    console.log(`\n[extractTrailingMoney] Input: "${s}"`);
    
    s = s.trim();
    console.log(`  After trim: "${s}"`);
    
    const dotIdx = s.lastIndexOf('.');
    console.log(`  dotIdx=${dotIdx}`);
    if (dotIdx < 0) return null;

    let i = dotIdx - 1;
    let collected = '';
    let digitsSinceComma = 0;
    let validCommaGroups = 0;

    let afterDot = s.slice(dotIdx);
    console.log(`  afterDot="${afterDot}"`);
    if (!/^\.\d{2}\s*$/.test(afterDot)) {
        console.log(`  ❌ afterDot regex failed`);
        return null;
    }
    afterDot = afterDot.trim();
    console.log(`  afterDot trimmed: "${afterDot}"`);

    // Walk left from before decimal point
    console.log(`  Walking left from position ${i}...`);
    while (i >= 0) {
        const ch = s[i];
        console.log(`    [${i}] char='${ch}' (${ch.charCodeAt(0)})`);
        
        if (/\d/.test(ch)) {
            collected = ch + collected;
            digitsSinceComma++;
            console.log(`      digit: collected="${collected}", digitsSinceComma=${digitsSinceComma}`);
            i--;
        } else if (ch === ',') {
            if (digitsSinceComma === 3) {
                collected = ch + collected;
                validCommaGroups++;
                digitsSinceComma = 0;
                console.log(`      comma: collected="${collected}", validCommaGroups=${validCommaGroups}`);
                i--;
            } else {
                console.log(`      comma invalid: digitsSinceComma=${digitsSinceComma} (need 3), stopping`);
                break;
            }
        } else {
            console.log(`      non-digit/comma: stopping`);
            break;
        }
    }

    console.log(`  Final: collected="${collected}", validCommaGroups=${validCommaGroups}`);
    if (validCommaGroups === 0) {
        console.log(`  ❌ No valid comma groups`);
        return null;
    }
    if (!collected) {
        console.log(`  ❌ collected is empty`);
        return null;
    }

    const firstCommaPos = collected.indexOf(',');
    console.log(`  firstCommaPos=${firstCommaPos}`);
    if (firstCommaPos < 0) return null;

    const charBeforeCollected = i >= 0 ? s[i] : '';
    console.log(`  charBeforeCollected='${charBeforeCollected}'`);

    let leadingDigits;
    // Simple logic for now: try 1-3
    leadingDigits = null;
    const maxTry = Math.min(3, firstCommaPos);
    console.log(`  Trying leading digits 1-${maxTry}...`);

    for (let ld = maxTry; ld >= 1; ld--) {
        const idx = firstCommaPos - ld;
        const candidate = collected.slice(idx);
        const isValid = /^\d{1,3}(,\d{3})*$/.test(candidate) && !/^0/.test(candidate);
        console.log(`    ld=${ld}, idx=${idx}, candidate="${candidate}", valid=${isValid}`);
        if (isValid) {
            leadingDigits = ld;
            break;
        }
    }
    
    if (leadingDigits === null) {
        console.log(`  ❌ No valid leading digits found`);
        return null;
    }

    const startIdx = firstCommaPos - leadingDigits;
    const bestMoney = collected.slice(startIdx) + afterDot;
    console.log(`  bestMoney="${bestMoney}"`);
    
    if (!/^\d{1,3}(,\d{3})*\.\d{2}$/.test(bestMoney)) {
        console.log(`  ❌ bestMoney format invalid`);
        return null;
    }

    const moneyStart = s.lastIndexOf(bestMoney);
    console.log(`  moneyStart=${moneyStart}`);
    if (moneyStart < 0) {
        console.log(`  ❌ moneyStart not found in original string`);
        return null;
    }

    console.log(`  ✅ Success: val="${bestMoney}", start=${moneyStart}`);
    return { val: bestMoney, start: moneyStart };
}

// Test the problematic case
const testStr = "TRSF E-BANKING DB 0906/FTSCY/WS95051 35440036.00 005236 MEGA ERA NASIONAL 35,440,036.00 ";

console.log('=== Test Case ===');
console.log(`Input: "${testStr}"`);
const result = extractTrailingMoney(testStr);
console.log(`\nResult: ${result ? JSON.stringify(result) : 'null'}`);

// Also test what happens if we strip the "MEGA ERA NASIONAL" part
const testStr2 = "TRSF E-BANKING DB 0906/FTSCY/WS95051 35440036.00 35,440,036.00 ";
console.log('\n\n=== Without Extra Text ===');
console.log(`Input: "${testStr2}"`);
const result2 = extractTrailingMoney(testStr2);
console.log(`\nResult: ${result2 ? JSON.stringify(result2) : 'null'}`);

// Test with only the money part
const testStr3 = "35,440,036.00 ";
console.log('\n\n=== Only Money ===');
console.log(`Input: "${testStr3}"`);
const result3 = extractTrailingMoney(testStr3);
console.log(`\nResult: ${result3 ? JSON.stringify(result3) : 'null'}`);
