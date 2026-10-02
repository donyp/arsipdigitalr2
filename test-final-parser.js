#!/usr/bin/env node

// Final test of BCA parser with all fixes applied

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

    const charBeforeCollected = i >= 0 ? s[i] : '';
    let isRefCodePattern = false;
    if (i >= 2) {
        const before2 = s[i-1];
        const before1 = s[i];
        if (/[A-Z]/.test(before2) && /[A-Z]/.test(before1)) {
            isRefCodePattern = true;
        }
    } else if (i === 1) {
        const before2 = s[0];
        const before1 = s[1];
        if (/[A-Z]/.test(before2) && /[A-Z]/.test(before1)) {
            isRefCodePattern = true;
        }
    }

    let leadingDigits;
    if (isRefCodePattern && firstCommaPos > 3) {
        const mod = (firstCommaPos + 1) % 3 || 3;
        leadingDigits = mod;
    } else {
        leadingDigits = null;
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
    }

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
    let debit = '', kredit = '', saldo = '';
    let amounts = [];

    rest = rest.trim();

    const dbSuffix = rest.match(/DB(\d{1,3}(?:,\d{3})*\.\d{2})?$/);
    if (dbSuffix) {
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

    const last = findLastMoney(rest);
    if (!last) return { debit, kredit, saldo, amounts };

    const beforeLast = rest.slice(0, last.start).trim();
    const second = findLastMoney(beforeLast);

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

function stripAmounts(rest, amountsToRemove = []) {
    let s = rest;
    
    // Remove ALL occurrences of DB marker
    s = s.replace(/\s*DB\s*/g, ' ');
    
    // Remove the specific amounts (both formatted and unformatted versions)
    for (const amt of amountsToRemove) {
        // Always try to remove the formatted version
        s = s.replace(amt, ' ').replace(/\s+/g, ' ').trim();
        
        // Also try to remove unformatted version
        const unformatted = amt.replace(/,/g, '');
        if (unformatted !== amt) {
            s = s.replace(unformatted, ' ').replace(/\s+/g, ' ').trim();
        }
    }
    
    // Remove 4-6 digit codes
    s = s.replace(/\b(\d{4,6})\b(?![\d\/])/g, ' ');

    return s.replace(/\s+/g, ' ').trim();
}

// Test cases
const tests = [
    {
        name: 'SETORAN TUNAI',
        input: '22/06 SETORAN TUNAI SETOR TUNAI 7510 7,363,884.00 8,243,931.00',
        expected: { tgl: '22/06', debit: '', kredit: '7,363,884.00', saldo: '8,243,931.00', ket: 'SETORAN TUNAI SETOR TUNAI' }
    },
    {
        name: 'TRSF E-BANKING with final DB',
        input: '09/06 TRSF E-BANKING DB 0906/FTSCY/WS95051 35440036.00 005236 MEGA ERA NASIONAL 35,440,036.00 DB',
        expected: { tgl: '09/06', debit: '35,440,036.00', kredit: '', saldo: '', ket: 'TRSF E-BANKING 0906/FTSCY/WS95051 MEGA ERA NASIONAL' }
    },
    {
        name: 'Date in D-Mon format',
        input: '6-Jun SETORAN TUNAI SETOR TUNAI 7510 7,363,884.00 8,243,931.00',
        expected: { tgl: '06/06', debit: '', kredit: '7,363,884.00', saldo: '8,243,931.00', ket: 'SETORAN TUNAI SETOR TUNAI' }
    },
];

console.log('🧪 Final BCA Parser Test\n');

tests.forEach(test => {
    console.log(`Test: ${test.name}`);
    
    // Parse date
    let dateMatch = test.input.match(/^(\d{2}\/\d{2})(.*)/);
    let datePart = '';
    let restPart = '';
    
    if (!dateMatch) {
        const monthTextMatch = test.input.match(/^(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(.*)$/i);
        if (monthTextMatch) {
            const day = monthTextMatch[1].padStart(2, '0');
            const monthText = monthTextMatch[2].toLowerCase();
            const monthMap = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
            const month = monthMap[monthText];
            datePart = `${day}/${String(month).padStart(2, '0')}`;
            restPart = monthTextMatch[3];
        }
    } else {
        datePart = dateMatch[1];
        restPart = dateMatch[2];
    }
    
    const { debit, kredit, saldo, amounts } = parseLine(restPart);
    const ket = stripAmounts(restPart, amounts).replace(/\s{2,}/g, ' ').trim();
    
    console.log(`  Parsed: tgl="${datePart}", debit="${debit}", kredit="${kredit}", saldo="${saldo}"`);
    console.log(`  Keterangan: "${ket}"`);
    
    const pass = 
        datePart === test.expected.tgl &&
        debit === test.expected.debit &&
        kredit === test.expected.kredit &&
        saldo === test.expected.saldo &&
        ket === test.expected.ket;
    
    console.log(`  Result: ${pass ? '✅ PASS' : '❌ FAIL'}\n`);
});
