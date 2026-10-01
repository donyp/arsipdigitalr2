// Test dengan modulo-based logic yang benar

function extractTrailingMoney(s) {
    const dotIdx = s.lastIndexOf('.');
    if (dotIdx < 0) return null;

    // Collect from right to first non-digit/non-comma
    let i = dotIdx - 1;
    let collected = '';
    let digitsSinceComma = 0;
    let anyValidComma = false;

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
                anyValidComma = true;
                digitsSinceComma = 0;
                i--;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    if (!anyValidComma || !collected) return null;

    const firstCommaPos = collected.indexOf(',');
    if (firstCommaPos < 0) return null;

    // What's immediately before collected?
    const charBeforeCollected = i >= 0 ? s[i] : '';
    const hasLetterBefore = /[A-Za-z]/.test(charBeforeCollected);

    let leadingDigits;
    if (hasLetterBefore) {
        // Letter ends ref code
        // If 7 leading digits: 7 % 3 = 1, butuh 2
        // Formula: ((firstCommaPos + 1) % 3) || 3
        // Test: (7+1) % 3 = 8 % 3 = 2 ✓
        // Test: 5 % 3 = 2, (5+1) % 3 = 6 % 3 = 0 → 3 ✓
        const mod = (firstCommaPos + 1) % 3 || 3;
        leadingDigits = mod;
    } else {
        // No letter: try 1, 2, 3
        // Pick LARGEST (most restrictive trim) that is valid
        leadingDigits = null;
        const maxTry = Math.min(3, firstCommaPos);
        for (let ld = maxTry; ld >= 1; ld--) {
            const idx = firstCommaPos - ld;
            if (idx < 0) continue;
            const candidate = collected.slice(idx);
            // Must: d{1,3}(,ddd)* AND no leading zero (unless single 0, but money won't be 0,xxx)
            if (/^\d{1,3}(,\d{3})*$/.test(candidate) && !/^0/.test(candidate)) {
                leadingDigits = ld;
                break;
            }
        }
        if (leadingDigits === null) return null;
    }

    // Extract money
    const startIdx = firstCommaPos - leadingDigits;
    if (startIdx < 0) return null;
    
    const bestMoney = collected.slice(startIdx) + afterDot;
    if (!/^\d{1,3}(,\d{3})*\.\d{2}$/.test(bestMoney)) return null;

    const moneyStart = s.lastIndexOf(bestMoney);
    if (moneyStart < 0) return null;

    return { val: bestMoney, start: moneyStart };
}

// Test
const tests = [
    { input: "WS9505123,625,000.00", expected: "23,625,000.00", desc: "Letter + 7-digit ref" },
    { input: "751088,000,000.00", expected: "88,000,000.00", desc: "4-digit CBG (no letter)" },
    { input: "100,000,000.00", expected: "100,000,000.00", desc: "Clean money" },
    { input: "9,161,912.00", expected: "9,161,912.00", desc: "Small money" },
    { input: "BS1234567,890,000.00", expected: "67,890,000.00", desc: "Letter + 7-digit" },
];

console.log("Testing with letter-based modulo:\n");
let passed = 0, failed = 0;

for (const test of tests) {
    const result = extractTrailingMoney(test.input);
    const actual = result ? result.val : null;
    const isPass = actual === test.expected;
    console.log(`${isPass ? "✓" : "✗"} ${test.desc}`);
    console.log(`  Input:    "${test.input}"`);
    console.log(`  Expected: "${test.expected}"`);
    console.log(`  Actual:   "${actual}"\n`);
    if (isPass) passed++; else failed++;
}

console.log(`Summary: ${passed}/${tests.length} passed`);
