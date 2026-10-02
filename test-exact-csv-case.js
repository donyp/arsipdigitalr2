#!/usr/bin/env node

// Test with the EXACT input that produces the wrong output
// to verify if OUR code would produce the right output

// The line from YOUR CSV that's wrong:
// "22/06","SETORAN TUNAI75 SETOR TUNAI","","107,363,884.00","8,243,931.00"
//
// This came from PDF line (from the PDF you provided):
// 22/06 SETORAN TUNAI 7510 7,363,884.00 8,243,931.00
//
// So the INPUT to parseBCA was probably:
// "22/06 SETORAN TUNAI 7510 7,363,884.00 8,243,931.00"

const testInput = `01/06 SALDO AWAL 9,161,912.00
08/06 SETORAN TUNAI 7510 100,000,000.00 109,161,912.00
SETOR TUNAI
09/06 SETORAN TUNAI 7510 88,000,000.00
SETOR TUNAI
22/06 SETORAN TUNAI 7510 7,363,884.00 8,243,931.00
SETOR TUNAI`;

console.log('Testing with EXACT input from your PDF\n');
console.log('Input lines:');
testInput.split('\n').forEach((line, i) => {
    console.log(`  ${i}: "${line}"`);
});
console.log();

// Copy of our NEW parser
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
    
    s = s.replace(/\s*DB\s*/g, ' ');
    
    for (const amt of amountsToRemove) {
        s = s.replace(amt, ' ').replace(/\s+/g, ' ').trim();
        
        const unformatted = amt.replace(/,/g, '');
        if (unformatted !== amt) {
            s = s.replace(unformatted, ' ').replace(/\s+/g, ' ').trim();
        }
    }
    
    s = s.replace(/\b(\d{4,6})\b(?![\d\/])/g, ' ');

    return s.replace(/\s+/g, ' ').trim();
}

// Minimal parser
const lines = testInput.split('\n');
const transactions = [];
let current = null;

const skipPatterns = [
    /^\s*$/,
];

for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (skipPatterns.some(p => p.test(line))) continue;

    const dateMatch = line.match(/^(\d{2}\/\d{2})(.*)/);
    
    if (dateMatch) {
        if (current) {
            transactions.push({
                'Tanggal': current.tgl,
                'Keterangan': current.ket,
                'Kredit': current.kredit,
                'Saldo': current.saldo
            });
        }

        const [, tgl, rest] = dateMatch;
        const { debit, kredit, saldo, amounts } = parseLine(rest);
        const ket = stripAmounts(rest, amounts).trim();

        current = { tgl, ket, debit, kredit, saldo };

    } else if (current) {
        if (/^\d[\d.]+$/.test(line)) continue;
        current.ket += ' ' + line;
    }
}

if (current) {
    transactions.push({
        'Tanggal': current.tgl,
        'Keterangan': current.ket,
        'Kredit': current.kredit,
        'Saldo': current.saldo
    });
}

console.log('NEW PARSER OUTPUT:\n');
transactions.forEach(t => {
    console.log(`${t.Tanggal} | ${t.Keterangan} | Kredit: ${t.Kredit} | Saldo: ${t.Saldo}`);
});

console.log('\n' + '='.repeat(80));
console.log('EXPECTED vs ACTUAL:');
console.log('='.repeat(80));

console.log('\n22/06 SETORAN TUNAI line:');
const line22 = transactions.find(t => t.Tanggal === '22/06');
console.log(`  Expected Kredit: 7,363,884.00`);
console.log(`  Actual Kredit:   ${line22.Kredit}`);
console.log(`  Match: ${line22.Kredit === '7,363,884.00' ? '✅ YES' : '❌ NO'}`);

console.log(`\n  Expected Keterangan: SETORAN TUNAI SETOR TUNAI`);
console.log(`  Actual Keterangan:   ${line22.Keterangan}`);
console.log(`  Match: ${line22.Keterangan === 'SETORAN TUNAI SETOR TUNAI' ? '✅ YES' : '❌ NO'}`);
