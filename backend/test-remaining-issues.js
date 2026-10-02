// Debug remaining issues

// Issue 1: SETORAN TUNAI75 masih ada
console.log("=== ISSUE 1: CBG cleanup ===\n");

const stripCBG = (s) => {
    console.log(`Before: "${s}"`);
    // Old regex: /(?<![\/\d])(\d{4})(?!\d|\/)/g
    let result = s.replace(/(?<![\/\d])(\d{4})(?!\d|\/)/g, '');
    console.log(`After 4-digit removal: "${result}"`);
    
    // The issue: "SETORAN TUNAI75" — "75" is 2-digit, not matched
    // Should we also remove other standalone digit patterns that are CBG?
    // CBG can be 4-digit (7510) or 2-digit? Let me check pattern
    
    return result;
};

const test1 = "SETORAN TUNAI75 SETOR TUNAI";
stripCBG(test1);

console.log("\n=== ISSUE 2: Keterangan missing parts ===\n");

// Raw probably: "TRSF E-BANKING DB0906/FTSCY/WS9505135440036.00005236 MEGA ERA NASIONAL"
// Expected ket: "TRSF E-BANKING DB 0906/FTSCY/WS95051 35440036.00 005236 MEGA ERA NASIONAL"
// Debit: 35,440,036.00

// The issue: when we extract debit "35,440,036.00", we should preserve:
// - space after DB
// - other amounts like "005236" (if they're not THE amount we extracted)

const raw2 = "TRSF E-BANKING DB0906/FTSCY/WS9505135440036.00005236 MEGA ERA NASIONAL";
console.log(`Raw: "${raw2}"`);
console.log(`Expected debit: 35,440,036.00`);
console.log(`Expected ket: TRSF E-BANKING DB 0906/FTSCY/WS95051 35440036.00 005236 MEGA ERA NASIONAL`);
console.log(`\nProblem: when we extract "35,440,036.00" we also remove "005236"`);
console.log(`But "005236" is a reference number, not THE transaction amount`);
console.log(`Solution: only remove amounts in CORRECT format (d{1,3}(,d{3})*\.d{2})`);
console.log(`"005236" doesn't match format (no dots) so should NOT be removed by amount stripping`);
console.log(`But maybe it IS being removed by CBG cleanup?`);
