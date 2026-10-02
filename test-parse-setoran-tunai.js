#!/usr/bin/env node

// Test the exact parseLine behavior with SETORAN TUNAI lines

function extractTrailingMoney(s) {
    s = s.trim();
    const dotIdx = s.lastIndexOf('.');
    if (dotIdx < 0) return null;

    let i = dotIdx - 1;
    let collected = '';
    let digitsSinceComma = 0;
    let validCommaGroups = 0;

    let afterDot = s.slice(dotIdx);
    if (!/^\.\d{2}\s*$/.test(afterDot)) return null;
    afterDot = afterDot.trim();

    while (i >= 0) {
        const ch = s[i];
        if (/\d/.test(ch)) {
            collected = ch + collected;
            digitsSinceComma++;
            i--;
        } else if (ch === ',') {
            if (digitsSinceComma === 3) {
                collected = ch + collected;
                validCommaGroups++;
                digitsSinceComma = 0;
                i--;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    if (validCommaGroups === 0) return null;
    if (!collected) return null;

    const firstCommaPos = collected.indexOf(',');
    if (firstCommaPos < 0) return null;

    let leadingDigits = null;
    const maxTry = Math.min(3, firstCommaPos);

    for (let ld = maxTry; ld >= 1; ld--) {
        const idx = firstCommaPos - ld;
        if (idx < 0) continue;

        const candidate = collected.slice(idx);
        if (/^\d{1,3}(,\d{3})*$/.test(candidate) && !/^0/.test(candidate)) {
            leadingDigits = ld;
            break;
        }
    }
    if (leadingDigits === null) return null;

    const startIdx = firstCommaPos - leadingDigits;
    if (startIdx < 0) return null;

    const bestMoney = collected.slice(startIdx) + afterDot;
    if (!/^\d{1,3}(,\d{3})*\.\d{2}$/.test(bestMoney)) return null;

    const moneyStart = s.lastIndexOf(bestMoney);
    if (moneyStart < 0) return null;

    return { val: bestMoney, start: moneyStart };
}

function findLastMoney(s) {
    return extractTrailingMoney(s);
}

function parseLine(rest) {
    console.log(`\n[parseLine] Input: "${rest}"`);
    
    let debit = '', kredit = '', saldo = '';
    let amounts = [];

    rest = rest.trim();

    // Case A: ends with DB
    const dbSuffix = rest.match(/DB(\d{1,3}(?:,\d{3})*\.\d{2})?$/);
    if (dbSuffix) {
        console.log(`  [DB mode] matched`);
        saldo = dbSuffix[1] || '';
        if (saldo) amounts.push(saldo);
        
        const beforeDB = rest.slice(0, rest.length - dbSuffix[0].length);
        const m = findLastMoney(beforeDB);
        if (m) {
            debit = m.val;
            amounts.push(debit);
        }
        return { debit, kredit, saldo, amounts };
    }

    // No DB: find last and second-to-last money
    console.log(`  [CR mode] searching for moneys`);
    const last = findLastMoney(rest);
    console.log(`  [CR mode] last money: ${last ? last.val : 'null'}`);
    if (!last) return { debit, kredit, saldo, amounts };

    const beforeLast = rest.slice(0, last.start).trim();
    console.log(`  [CR mode] beforeLast: "${beforeLast}"`);
    
    const second = findLastMoney(beforeLast);
    console.log(`  [CR mode] second money: ${second ? second.val : 'null'}`);

    if (second) {
        kredit = second.val;
        saldo  = last.val;
        amounts.push(kredit, saldo);
    } else {
        const beforeVal = rest.slice(0, last.start).toUpperCase();
        if (/SALDO\s*(AWAL|AKHIR)/.test(beforeVal)) {
            saldo = last.val;
            amounts.push(saldo);
        } else {
            kredit = last.val;
            amounts.push(kredit);
        }
    }
    return { debit, kredit, saldo, amounts };
}

// Test cases from actual PDF
const testCases = [
    {
        name: 'SETORAN TUNAI 08/06',
        input: ' SETORAN TUNAI 7510 100,000,000.00 109,161,912.00',
        expected: { kredit: '100,000,000.00', saldo: '109,161,912.00' }
    },
    {
        name: 'SETORAN TUNAI 22/06 (problem case)',
        input: ' SETORAN TUNAI 7510 7,363,884.00 8,243,931.00',
        expected: { kredit: '7,363,884.00', saldo: '8,243,931.00' }
    },
];

testCases.forEach(test => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Test: ${test.name}`);
    console.log(`${'='.repeat(60)}`);
    
    const result = parseLine(test.input);
    
    console.log(`\nResult:`);
    console.log(`  debit: "${result.debit}"`);
    console.log(`  kredit: "${result.kredit}"`);
    console.log(`  saldo: "${result.saldo}"`);
    console.log(`  amounts: [${result.amounts.join(', ')}]`);
    
    console.log(`\nExpected:`);
    console.log(`  kredit: "${test.expected.kredit}"`);
    console.log(`  saldo: "${test.expected.saldo}"`);
    
    const pass = result.kredit === test.expected.kredit && result.saldo === test.expected.saldo;
    console.log(`\nStatus: ${pass ? '✅ PASS' : '❌ FAIL'}`);
});
