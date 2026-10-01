// Test date format conversion

function convertDate(line) {
    // Try DD/MM format
    let dateMatch = line.match(/^(\d{2}\/\d{2})(.*)/);
    
    // Also support D-Mon or DD-Mon format
    if (!dateMatch) {
        const monthTextMatch = line.match(/^(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(.*)$/i);
        if (monthTextMatch) {
            const day = monthTextMatch[1].padStart(2, '0');
            const monthText = monthTextMatch[2].toLowerCase();
            const monthMap = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
            const month = monthMap[monthText];
            if (month) {
                const tgl = `${day}/${String(month).padStart(2, '0')}`;
                const rest = monthTextMatch[3];
                dateMatch = [null, tgl, rest];
            }
        }
    }
    
    return dateMatch ? { tgl: dateMatch[1], rest: dateMatch[2] } : null;
}

const tests = [
    { input: "13/06 SETORAN TUNAI", expected: "13/06", desc: "Already numeric" },
    { input: "6-Jan SETORAN", expected: "06/01", desc: "Single digit day with text month" },
    { input: "13-Aug TRSF", expected: "13/08", desc: "Double digit day with text month" },
    { input: "15/06 TRSF E-BANKING", expected: "15/06", desc: "Double digit numeric" },
];

console.log("Testing date format conversion:\n");
let passed = 0;

for (const test of tests) {
    const result = convertDate(test.input);
    const actual = result ? result.tgl : null;
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
