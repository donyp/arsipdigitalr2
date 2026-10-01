// Final test with ref code pattern detection

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

    // Check if it's a ref code pattern: 2 uppercase letters at word boundary
    let isRefCodePattern = false;
    if (i >= 2) {
        const before3 = s[i-2];
        const before2 = s[i-1];
        const before1 = s[i];
        if (/[A-Z]/.test(before2) && /[A-Z]/.test(before1) && !/[A-Za-z]/.test(before3)) {
            isRefCodePattern = true;
        }
    } else if (i === 1) {
        const before2 = s[0];
        const before1 = s[1];
        if (/[A-Z]/.test(before2) && /[A-Z]/.test(before1)) {
            isRefCodePattern = true;
        }
    }

    let leadingDigits;
    if (isRefCodePattern && firstCommaPos > 3) {
        const mod = (firstCommaPos + 1) % 3 || 3;
        leadingDigits = mod;
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

// Test
const tests = [
    { input: "WS9505123,625,000.00", expected: "23,625,000.00", desc: "REF CODE: WS + 7-digit" },
    { input: "SETORAN TUNAI7510100,000,000.00", expected: "100,000,000.00", desc: "NO REF CODE: TUNAI + CBG + money" },
    { input: "100,000,000.00", expected: "100,000,000.00", desc: "Clean money" },
    { input: "9,161,912.00", expected: "9,161,912.00", desc: "Small money" },
    { input: "BS1234567,890,000.00", expected: "67,890,000.00", desc: "REF CODE: BS + 7-digit" },
];

console.log("Final test with ref code detection:\n");
let passed = 0;

for (const test of tests) {
    const result = extractTrailingMoney(test.input);
    const actual = result ? result.val : null;
    const isPass = actual === test.expected;
    
    console.log(`${isPass ? "✓" : "✗"} ${test.desc}`);
    if (!isPass) {
        console.log(`  Input:    "${test.input}"`);
        console.log(`  Expected: "${test.expected}"`);
        console.log(`  Got:      "${actual}"`);
    }
    if (isPass) passed++;
}

console.log(`\nSummary: ${passed}/${tests.length} passed`);
