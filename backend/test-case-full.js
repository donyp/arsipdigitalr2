// Full test dengan parsing + keterangan cleanup

function stripAmounts(rest, amountsToRemove = []) {
    let s = rest;
    
    // Add space after DB marker if not already there
    s = s.replace(/DB(\S)/g, 'DB $1');
    
    // Remove trailing DB marker if present
    s = s.replace(/DB\s*$/, '').trim();
    
    // Remove the specific amounts that were extracted
    for (const amt of amountsToRemove) {
        // Try formatted
        s = s.replace(amt, ' ').replace(/\s+/g, ' ').trim();
        
        // Try unformatted
        const unformatted = amt.replace(/,/g, '');
        if (unformatted !== amt) {
            s = s.replace(unformatted, ' ').replace(/\s+/g, ' ').trim();
        }
    }

    // Remove standalone 4-digit CBG
    s = s.replace(/(?<![\/\d])(\d{4})(?!\d|\/)/g, '');

    return s.replace(/\s+/g, ' ').trim();
}

const raw = "22/06 SETORAN TUNAI SETOR TUNAI 7510 7,363,884.00 8,243,931.00";
console.log(`Raw: "${raw}\n"`);

const dateMatch = raw.match(/^(\d{2}\/\d{2})(.*)/);
const [, tgl, rest] = dateMatch;

console.log(`Tanggal: ${tgl}`);
console.log(`Rest for parsing: "${rest}"`);

// Simulate parseLine
const parsedRest = rest.trim();
const amounts = ["7,363,884.00", "8,243,931.00"];  // These would be extracted
console.log(`\nAmounts to remove: [${amounts.map(a => `"${a}"`).join(', ')}]`);

// Clean keterangan
const ket = stripAmounts(rest, amounts);
console.log(`\nKeterangan: "${ket}"`);
console.log(`Expected:  "SETORAN TUNAI SETOR TUNAI"` );
console.log(`Match: ${ket === "SETORAN TUNAI SETOR TUNAI" ? "✓" : "✗"}`);
