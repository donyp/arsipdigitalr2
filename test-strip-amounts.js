function stripAmounts(rest, amountsToRemove = []) {
    let s = rest;
    
    // Remove ALL occurrences of DB marker (leading, trailing, or embedded)
    s = s.replace(/\s*DB\s*/g, ' ');
    
    // Remove the specific amounts that were extracted
    for (const amt of amountsToRemove) {
        // Try removing formatted version first
        const beforeFormatted = s;
        s = s.replace(amt, ' ').replace(/\s+/g, ' ').trim();
        
        // Only try unformatted if formatted wasn't found
        if (beforeFormatted === s) {
            const unformatted = amt.replace(/,/g, '');
            if (unformatted !== amt) {
                s = s.replace(unformatted, ' ').replace(/\s+/g, ' ').trim();
            }
        }
    }
    
    // Remove 4-6 digit codes (CBG, bank ref codes) that are standalone
    // But preserve those part of ref codes like "0806/" or "WS95051"
    s = s.replace(/\b(\d{4,6})\b(?![\d\/])/g, ' ');

    return s.replace(/\s+/g, ' ').trim();
}

const tests = [
    {
        input: 'TRSF E-BANKING DB 0906/FTSCY/WS95051 35440036.00 005236 MEGA ERA NASIONAL',
        amounts: ['35,440,036.00'],
        expected: 'TRSF E-BANKING 0906/FTSCY/WS95051 MEGA ERA NASIONAL'
    },
    {
        input: 'SETORAN TUNAI SETOR TUNAI 7510 PLACEHOLDER_FOR_REMOVED_AMT',
        amounts: ['PLACEHOLDER_FOR_REMOVED_AMT'],
        expected: 'SETORAN TUNAI SETOR TUNAI'
    }
];

tests.forEach((test, i) => {
    console.log(`\nTest ${i+1}:`);
    const result = stripAmounts(test.input, test.amounts);
    console.log('Input:', test.input);
    console.log('Result:', result);
    console.log('Expected:', test.expected);
    console.log('Match:', result === test.expected ? '✅' : '❌');
});
