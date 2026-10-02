#!/usr/bin/env node

// Analyze the ACTUAL CSV output to reverse-engineer what the parser is receiving

const wrongOutput = {
    line1: { date: "08/06", ket: "SETORAN TUNAI7510 SETOR TUNAI", kredit: "100,000,000.00" },
    line2: { date: "22/06", ket: "SETORAN TUNAI75 SETOR TUNAI", kredit: "107,363,884.00" },
};

console.log('🔍 Reverse-Engineering the Parser Bug\n');

console.log('Observation 1: SETORAN TUNAI7510 vs SETORAN TUNAI75');
console.log('  First case: "SETORAN TUNAI7510" (all 4 digits preserved)');
console.log('  Second case: "SETORAN TUNAI75" (only first 2 digits!)');
console.log('  Why? Maybe stripAmounts is removing the "10" part?');
console.log();

console.log('Observation 2: Amount values');
console.log('  Case 1: kredit 100,000,000.00 = 100M ✓ (correct)');
console.log('  Case 2: kredit 107,363,884.00 = 107M ✗ (should be 7,363,884.00)');
console.log('  Difference: 100M (case 1) vs 7,363,884 (should be) but got 107,363,884');
console.log('  Theory: "7" + "100" + "363,884" = "7100363,884"? No...');
console.log('  Better theory: 10 + 7,363,884 = 17,363,884? No...');
console.log('  Actual theory: 100 + 7,363,884 = 107,363,884! ✓ BINGO');
console.log();

console.log('💡 ROOT CAUSE HYPOTHESIS:');
console.log('  The parser is COMBINING amounts from different lines!');
console.log('  Case 1 (08/06): 100,000,000.00 ← parsed correctly');
console.log('  Case 2 (22/06): 7,363,884.00 + 8,243,931.00 saldo');
console.log('               But ALSO includes value from previous line!');
console.log('               100 (from line 1) + 7,363,884 = 107,363,884');
console.log();

console.log('🤔 Alternative Theory:');
console.log('  Maybe parseLine is finding BOTH moneys wrong way?');
console.log('  For "SETORAN TUNAI 7510 7,363,884.00 8,243,931.00":');
console.log('    - Should find: kredit=7,363,884.00, saldo=8,243,931.00');
console.log('    - But finding: kredit=107,363,884.00 (mixing in old value?)');
console.log();

console.log('⚠️  CRITICAL INSIGHT:');
console.log('  The problem is NOT in money extraction');
console.log('  The problem is NOT in stripAmounts');
console.log('  The problem is: STALE VARIABLE or WRONG INITIALIZATION');
console.log();
console.log('  Look at code structure:');
console.log('    let current = null;');
console.log('    for (const raw of lines) {');
console.log('      if (dateMatch) {');
console.log('        pushCurrent();');
console.log('        const { debit, kredit, saldo, amounts } = parseLine(rest);');
console.log('        current = { tgl, ket, debit, kredit, saldo };');
console.log('      }');
console.log('    }');
console.log();
console.log('  IF pushCurrent() has a bug, previous transaction data persists!');
console.log();

console.log('⚠️  ANOTHER INSIGHT:');
console.log('  "SETORAN TUNAI7510" becomes "SETORAN TUNAI75"');
console.log('  This looks like stripAmounts removing "10"');
console.log('  Why would "10" be removed? Is 10 being treated as a digit code?');
console.log();
console.log('  The digit removal regex: /\\b(\\d{4,6})\\b(?![\\d\\/])/g');
console.log('  This matches 4-6 digit WORDS not part of ref codes');
console.log('  "7510" is 4 digits → should match and be removed');
console.log('  But output shows "75" remained, so only "10" was removed');
console.log('  This suggests the regex is matching "10" separately?');
console.log();

console.log('🎯 MOST LIKELY ISSUE:');
console.log('  1. The parser IS still old (pre-fixes)');
console.log('  2. OR Railway redeploy failed/cached old version');
console.log('  3. OR There\'s a completely different parser endpoint being used');
console.log();
console.log('NEXT STEPS:');
console.log('  1. Check Railway logs for ACTUAL debug message');
console.log('  2. Look for which parser is being called (BCA vs other)');
console.log('  3. Check if there are MULTIPLE pdf-to-csv endpoints');
console.log('  4. Verify which endpoint is actually being used');
