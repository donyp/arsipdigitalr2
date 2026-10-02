// Check if there's a space before collected digits

const tests = [
    "WS9505123,625,000.00",      // ref code: no space
    "SETORAN TUNAI7510100,000,000.00",  // CBG after word: has space
    "TUNAI7510100,000,000.00",          // word directly: has space? Let's check
    "I7510100,000,000.00",               // just letter: has space?
];

for (const s of tests) {
    // Find collected (digits + commas from right)
    const dotIdx = s.lastIndexOf('.');
    let i = dotIdx - 1;
    
    while (i >= 0) {
        const ch = s[i];
        if (/\d/.test(ch) || ch === ',') {
            i--;
        } else {
            break;
        }
    }
    
    // i is now at position before collected
    const charBefore = i >= 0 ? s[i] : '';
    const spaceIdx = i;
    
    console.log(`String: "${s}"`);
    console.log(`  Char at i=${i}: "${charBefore}"`);
    console.log(`  Has space before? ${charBefore === ' '}`);
    console.log();
}
