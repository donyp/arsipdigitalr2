// Test keterangan extraction dengan updated findLastMoney

// Copy fungsi exact dari backend
function extractTrailingMoney(s) {
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
        if (firstCommaPos > 3) {
            const mod = (firstCommaPos + 1) % 3 || 3;
            leadingDigits = mod;
        } else {
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

function findLastMoney(s) {
    return extractTrailingMoney(s);
}

function stripAmounts(rest, amountsToRemove = []) {
    let s = rest;
    
    // Remove trailing DB marker if present
    s = s.replace(/DB\s*$/, '').trim();
    
    // Remove the specific amounts that were extracted
    for (const amt of amountsToRemove) {
        // Replace first occurrence of this amount
        s = s.replace(amt, ' ').replace(/\s+/g, ' ').trim();
    }

    // Remove standalone 4-digit CBG (not part of ref codes like 0806/... or WS95051)
    s = s.replace(/(?<![\/\d])(\d{4})(?!\d|\/)/g, '');

    return s.replace(/\s+/g, ' ').trim();
}

// Test
const tests = [
    {
        input: "TRSF E-BANKING DB0806/FTSCY/WS9505123,625,000.00DB",
        amountsToRemove: ["23,625,000.00"],
        expected: "TRSF E-BANKING DB0806/FTSCY/WS95051",
        desc: "Glued ref code + DB"
    },
    {
        input: "SETORAN TUNAI7510100,000,000.00",
        amountsToRemove: ["100,000,000.00"],
        expected: "SETORAN TUNAI",
        desc: "CBG + money"
    },
    {
        input: "SALDO AWAL9,161,912.00",
        amountsToRemove: ["9,161,912.00"],
        expected: "SALDO AWAL",
        desc: "SALDO line"
    },
    {
        input: "TRSF E-BANKING DB 0806/FTSCY/WS95051 23625000.00 GG2303033 NATURAL INSULATION",
        amountsToRemove: ["23625000.00"],
        expected: "TRSF E-BANKING DB 0806/FTSCY/WS95051 GG2303033 NATURAL INSULATION",
        desc: "Real keterangan with embedded money"
    }
];

console.log("Testing stripAmounts with specific amounts removal:\n");
let passed = 0;

for (const test of tests) {
    const result = stripAmounts(test.input, test.amountsToRemove || []);
    const pass = result === test.expected;
    console.log(`${pass ? "✓" : "✗"} ${test.desc}`);
    if (!pass) {
        console.log(`  Input:    "${test.input}"`);
        console.log(`  Amounts:  [${test.amountsToRemove ? test.amountsToRemove.map(a => `"${a}"`).join(', ') : ''}]`);
        console.log(`  Expected: "${test.expected}"`);
        console.log(`  Got:      "${result}"`);
    }
    if (pass) passed++;
}

console.log(`\nResult: ${passed}/${tests.length} passed`);
