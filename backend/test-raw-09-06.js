// Debug raw 09/06 case

function stripAmounts(rest, amountsToRemove = []) {
    console.log(`\nstripAmounts input: "${rest}"`);
    console.log(`Amounts to remove: [${amountsToRemove.map(a => `"${a}"`).join(', ')}]`);
    
    let s = rest;
    
    // Add space after DB marker
    s = s.replace(/DB(\S)/g, 'DB $1');
    console.log(`After DB space: "${s}"`);
    
    // Remove trailing DB
    s = s.replace(/DB\s*$/, '').trim();
    console.log(`After DB trim: "${s}"`);
    
    // Remove amounts
    for (const amt of amountsToRemove) {
        console.log(`\n  Removing "${amt}":`);
        
        // Formatted first
        const beforeFormatted = s;
        s = s.replace(amt, ' ').replace(/\s+/g, ' ').trim();
        if (beforeFormatted !== s) {
            console.log(`    After formatted: "${s}"`);
        } else {
            // Only unformatted if formatted not found
            const unformatted = amt.replace(/,/g, '');
            if (unformatted !== amt) {
                const before2 = s;
                s = s.replace(unformatted, ' ').replace(/\s+/g, ' ').trim();
                if (before2 !== s) console.log(`    After unformatted: "${s}"`);
            }
        }
    }
    
    // Remove CBG
    const before = s;
    s = s.replace(/(?<![\/\d])(\d{4})(?!\d|\/)/g, '');
    if (before !== s) console.log(`After CBG remove: "${s}"`);

    s = s.replace(/\s+/g, ' ').trim();
    console.log(`Final: "${s}"`);
    return s;
}

// Test case 1
const raw1 = "TRSF E-BANKING DB 0906/FTSCY/WS95051 35440036.00 005236 MEGA ERA NASIONAL 35,440,036.00";
const amounts1 = ["35,440,036.00"];
const result1 = stripAmounts(raw1, amounts1);

console.log(`\nExpected: "TRSF E-BANKING DB 0906/FTSCY/WS95051 35440036.00 005236 MEGA ERA NASIONAL"`);
console.log(`Got:      "${result1}"`);
console.log(`Match: ${result1 === "TRSF E-BANKING DB 0906/FTSCY/WS95051 35440036.00 005236 MEGA ERA NASIONAL" ? "✓" : "✗"}`);

// Test case 2
console.log("\n" + "=".repeat(60));
const raw2 = "SETORAN TUNAI SETOR TUNAI 7510 7,363,884.00 8,243,931.00";
const amounts2 = ["7,363,884.00", "8,243,931.00"];
const result2 = stripAmounts(raw2, amounts2);

console.log(`\nExpected: "SETORAN TUNAI SETOR TUNAI"`);
console.log(`Got:      "${result2}"`);
console.log(`Match: ${result2 === "SETORAN TUNAI SETOR TUNAI" ? "✓" : "✗"}`);