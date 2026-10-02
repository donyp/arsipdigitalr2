// Test extractTrailingMoney FIXED - use same logic regardless of letter

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

    console.log(`Collected: "${collected}", firstCommaPos: ${firstCommaPos}, hasLetter: ${hasLetterBefore}`);

    // ALWAYS use same logic: try 1-3 leading digits, pick LARGEST valid (no leading zero)
    let leadingDigits = null;
    const maxTry = Math.min(3, firstCommaPos);

    console.log(`Trying leading digits 1-${maxTry}:`);
    for (let ld = maxTry; ld >= 1; ld--) {
        const idx = firstCommaPos - ld;
        if (idx < 0) continue;

        const candidate = collected.slice(idx);
        const isValid = /^\d{1,3}(,\d{3})*$/.test(candidate);
        const noLeadZero = !/^0/.test(candidate);
        console.log(`  ld=${ld}: candidate="${candidate}", valid=${isValid}, noLeadZero=${noLeadZero}`);
        
        if (isValid && noLeadZero) {
            leadingDigits = ld;
            console.log(`  → PICK!`);
            break;
        }
    }
    if (leadingDigits === null) return null;

    const startIdx = firstCommaPos - leadingDigits;
    if (startIdx < 0) return null;

    const bestMoney = collected.slice(startIdx) + afterDot;
    if (!/^\d{1,3}(,\d{3})*\.\d{2}$/.test(bestMoney)) return null;

    const moneyStart = s.lastIndexOf(bestMoney);
    if (moneyStart < 0) return null;

    return { val: bestMoney, start: moneyStart };
}

// Test cases
const tests = [
    { input: "WS9505123,625,000.00", expected: "23,625,000.00", desc: "Letter + 7-digit ref" },
    { input: "SETORAN TUNAI7510100,000,000.00", expected: "100,000,000.00", desc: "Letter + CBG + money" },
    { input: "100,000,000.00", expected: "100,000,000.00", desc: "Clean money" },
    { input: "9,161,912.00", expected: "9,161,912.00", desc: "Small money" },
];

console.log("Testing extractTrailingMoney FIXED:\n");
let passed = 0;

for (const test of tests) {
    console.log(`\n[${test.desc}]`);
    console.log(`Input: "${test.input}"`);
    const result = extractTrailingMoney(test.input);
    const actual = result ? result.val : null;
    const isPass = actual === test.expected;
    console.log(`Expected: "${test.expected}"`);
    console.log(`Got:      "${actual}"`);
    console.log(`${isPass ? "✓ PASS" : "✗ FAIL"}\n`);
    if (isPass) passed++;
}

console.log(`\nSummary: ${passed}/${tests.length} passed`);
