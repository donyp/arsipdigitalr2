// Debug SETORAN TUNAI case

function stripAmounts(rest, amountsToRemove = []) {
    let s = rest;
    
    // Remove trailing DB marker if present
    s = s.replace(/DB\s*$/, '').trim();
    
    // Remove the specific amounts that were extracted
    for (const amt of amountsToRemove) {
        s = s.replace(amt, ' ').replace(/\s+/g, ' ').trim();
    }

    // Remove standalone 4-digit CBG (not part of ref codes like 0806/... or WS95051)
    console.log(`Before CBG remove: "${s}"`);
    s = s.replace(/(?<![\/\d])(\d{4})(?!\d|\/)/g, '');
    console.log(`After CBG remove: "${s}"`);

    return s.replace(/\s+/g, ' ').trim();
}

// Test
const raw = "SETORAN TUNAI7510100,000,000.00";
console.log(`Raw: "${raw}"`);
console.log(`After stripAmounts with amount removal:`);
const result = stripAmounts(raw, ["100,000,000.00"]);
console.log(`Result: "${result}"`);
console.log(`\nProblem: "75101" masih ada, harusnya hanya "SETORAN TUNAI"`);
console.log(`\nCause: After removing "100,000,000.00", tersisa "SETORAN TUNAI7510 1"`);
console.log(`Then CBG regex /(?<![\/\\d])(\\d{4})(?!\\d|\\/)/ should match "7510" but not "1"`);
console.log(`\nLet's check if regex matches "7510" dan "1":`);

const before = "SETORAN TUNAI7510 1";
console.log(`\nTesting on: "${before}"`);
const m1 = before.match(/(?<![\/\d])(\d{4})(?!\d|\/)/g);
console.log(`Matches for 4-digit: ${m1 ? m1.join(', ') : 'none'}`);

// Also test 1-digit removal
const m2 = before.match(/(?<![\/\d])(\d{1})(?!\d|\/)/g);
console.log(`Matches for 1-digit: ${m2 ? m2.join(', ') : 'none'}`);
