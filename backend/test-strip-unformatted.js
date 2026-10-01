// Test stripAmounts dengan unformatted amounts

function stripAmounts(rest, amountsToRemove = []) {
    let s = rest;
    
    // Add space after DB marker if not already there
    // "DB0906" → "DB 0906"
    s = s.replace(/DB(\S)/g, 'DB $1');
    
    // Remove trailing DB marker if present
    s = s.replace(/DB\s*$/, '').trim();
    
    // Remove the specific amounts that were extracted
    for (const amt of amountsToRemove) {
        // Try removing formatted version
        s = s.replace(amt, ' ').replace(/\s+/g, ' ').trim();
        
        // Also try removing unformatted version
        const unformatted = amt.replace(/,/g, '');
        if (unformatted !== amt) {
            console.log(`  Also trying unformatted: "${unformatted}"`);
            s = s.replace(unformatted, ' ').replace(/\s+/g, ' ').trim();
        }
    }

    // Remove standalone 4-digit CBG
    s = s.replace(/(?<![\/\d])(\d{4})(?!\d|\/)/g, '');

    return s.replace(/\s+/g, ' ').trim();
}

const tests = [
    {
        raw: "TRSF E-BANKING DB0906/FTSCY/WS9505135440036.00005236 MEGA ERA NASIONAL",
        amounts: ["35,440,036.00"],
        expected: "TRSF E-BANKING DB 0906/FTSCY/WS95051 005236 MEGA ERA NASIONAL",
        desc: "Unformatted amount in raw with DB space"
    }
];

console.log("Testing stripAmounts with unformatted amounts:\n");

for (const test of tests) {
    console.log(`Raw: "${test.raw}"`);
    console.log(`Removing amounts: [${test.amounts.map(a => `"${a}"`).join(', ')}]`);
    const result = stripAmounts(test.raw, test.amounts);
    const pass = result === test.expected;
    
    console.log(`Expected: "${test.expected}"`);
    console.log(`Got:      "${result}"`);
    console.log(`${pass ? "✓ PASS" : "✗ FAIL"}\n`);
}
