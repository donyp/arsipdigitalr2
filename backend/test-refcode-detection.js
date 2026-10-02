// Detect if collected digits are part of ref code (2-letter prefix)

const tests = [
    { str: "WS9505123,625,000.00", expected: true, desc: "WS ref code" },
    { str: "SETORAN TUNAI7510100,000,000.00", expected: false, desc: "No ref code" },
    { str: "TX1234123,625,000.00", expected: true, desc: "TX ref code" },
    { str: "BS1234567,890,000.00", expected: true, desc: "BS ref code" },
];

for (const test of tests) {
    const s = test.str;
    const dotIdx = s.lastIndexOf('.');
    let i = dotIdx - 1;
    
    while (i >= 0 && (/\d/.test(s[i]) || s[i] === ',')) {
        i--;
    }
    
    // Check if there's 2-letter pattern before i, AND it's NOT part of a word
    // Pattern: s[i-2] and s[i-1] are uppercase letters, and before them is NOT a letter
    let hasRefCodePattern = false;
    if (i >= 2) {
        const before3 = s[i-2];
        const before2 = s[i-1];
        const before1 = s[i];
        
        // before2 and before1 should be uppercase, and before3 should NOT be letter
        if (/[A-Z]/.test(before2) && /[A-Z]/.test(before1) && !/[A-Za-z]/.test(before3)) {
            hasRefCodePattern = true;
        }
    } else if (i === 1) {
        // At start of string with 2 uppercase letters
        const before2 = s[0];
        const before1 = s[1];
        if (/[A-Z]/.test(before2) && /[A-Z]/.test(before1)) {
            hasRefCodePattern = true;
        }
    }
    
    console.log(`"${s}"`);
    console.log(`  i=${i}, before[i-2]="${s[i-2]}", before[i-1]="${s[i-1]}", before[i]="${s[i]}"`);
    console.log(`  Has ref code pattern: ${hasRefCodePattern} (expected: ${test.expected})`);
    console.log(`  ${hasRefCodePattern === test.expected ? "✓" : "✗"}\n`);
}
