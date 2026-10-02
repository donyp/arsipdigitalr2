// Test stripAmounts untuk debug

function findLastMoney(s) {
    // Simplified extractTrailingMoney for test
    const dotIdx = s.lastIndexOf('.');
    if (dotIdx < 0) return null;
    
    let i = dotIdx - 1;
    let collected = '';
    let digitsSinceComma = 0;
    let validCommaGroups = 0;
    
    let afterDot = s.slice(dotIdx);
    if (!/^\.\d{2}$/.test(afterDot)) return null;
    
    while (i >= 0) {
        const ch = s[i];
        if (/\d/.test(ch)) {
            collected = ch + collected;
            digitsSinceComma++;
            i--;
        } else if (ch === ',') {
            if (digitsSinceComma === 3) {
                collected = ch + collected;
                validCommaGroups++;
                digitsSinceComma = 0;
                i--;
            } else {
                break;
            }
        } else {
            break;
        }
    }
    
    if (validCommaGroups === 0) return null;
    if (!collected) return null;
    
    const firstCommaPos = collected.indexOf(',');
    if (firstCommaPos < 0) return null;
    
    const charBeforeCollected = i >= 0 ? s[i] : '';
    const hasLetterBefore = /[A-Za-z]/.test(charBeforeCollected);
    
    let leadingDigits;
    if (hasLetterBefore) {
        // Letter ends ref code
        // All leading digits before first comma are money leading
        // But must be valid (1-3 digits)
        if (firstCommaPos > 3) {
            // Use modulo to find best split
            const mod = (firstCommaPos + 1) % 3 || 3;
            leadingDigits = mod;
        } else {
            // Already valid, take all
            leadingDigits = firstCommaPos;
        }
    } else {
        leadingDigits = null;
        const maxTry = Math.min(3, firstCommaPos);
        for (let ld = maxTry; ld >= 1; ld--) {
            const idx = firstCommaPos - ld;
            if (idx < 0) continue;
            const candidate = collected.slice(idx);
            if (/^\d{1,3}(,\d{3})*$/.test(candidate) && !/^0/.test(candidate)) {
                leadingDigits = ld;
                break;
            }
        }
        if (leadingDigits === null) return null;
    }
    
    const startIdx = firstCommaPos - leadingDigits;
    if (startIdx < 0) return null;
    
    const bestMoney = collected.slice(startIdx) + afterDot;
    if (!/^\d{1,3}(,\d{3})*\.\d{2}$/.test(bestMoney)) return null;
    
    const moneyStart = s.lastIndexOf(bestMoney);
    if (moneyStart < 0) return null;
    
    return { val: bestMoney, start: moneyStart };
}

function stripAmounts(rest) {
    console.log(`\nstripAmounts input: "${rest}"`);
    
    const dbSuffix = rest.match(/DB(\d{1,3}(?:,\d{3})*\.\d{2})?$/);
    console.log(`  dbSuffix match: ${dbSuffix ? dbSuffix[0] : 'none'}`);
    
    let s;
    if (dbSuffix) {
        s = rest.slice(0, rest.length - dbSuffix[0].length);
        console.log(`  After strip DB: "${s}"`);
        
        const m = findLastMoney(s);
        console.log(`  findLastMoney: ${m ? `"${m.val}" at pos ${m.start}` : 'none'}`);
        
        if (m) {
            s = s.slice(0, m.start);
            console.log(`  After strip money: "${s}"`);
        }
    } else {
        const last = findLastMoney(rest);
        if (!last) {
            console.log(`  No money found, return as-is`);
            return rest;
        }
        console.log(`  last money: "${last.val}" at pos ${last.start}`);
        
        const beforeLast = rest.slice(0, last.start);
        const second = findLastMoney(beforeLast);
        console.log(`  second money: ${second ? `"${second.val}"` : 'none'}`);
        
        if (second) {
            s = rest.slice(0, second.start);
            console.log(`  Using second money, slice to ${second.start}`);
        } else {
            s = rest.slice(0, last.start);
            console.log(`  Using last money, slice to ${last.start}`);
        }
        console.log(`  After strip money: "${s}"`);
    }

    // Remove standalone 4-digit CBG
    const before4digit = s;
    s = s.replace(/(?<![\/\d])(\d{4})(?!\d|\/)/g, '');
    if (before4digit !== s) {
        console.log(`  After remove 4-digit CBG: "${s}"`);
    }

    console.log(`  Final result: "${s}"`);
    return s;
}

// Test
const tests = [
    {
        input: "TRSF E-BANKING DB0806/FTSCY/WS9505123,625,000.00DB",
        expected: "TRSF E-BANKING DB0806/FTSCY/WS95051",
        desc: "Glued ref code + DB"
    },
    {
        input: "SETORAN TUNAI7510100,000,000.00",
        expected: "SETORAN TUNAI100,000,000.00",
        desc: "CBG + money (no ref code)"
    },
    {
        input: "SALDO AWAL9,161,912.00",
        expected: "SALDO AWAL",
        desc: "SALDO line"
    }
];

console.log(`\nTesting stripAmounts:\n`);
for (const test of tests) {
    const result = stripAmounts(test.input);
    const pass = result === test.expected;
    console.log(`${pass ? "✓" : "✗"} ${test.desc}`);
    if (!pass) {
        console.log(`  Input:    "${test.input}"`);
        console.log(`  Expected: "${test.expected}"`);
        console.log(`  Got:      "${result}"`);
    }
}
