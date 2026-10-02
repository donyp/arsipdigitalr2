// Test parseLine with exact 22/06 BCA input

function extractTrailingMoney(s) {
    s = s.trim();
    const dotIdx = s.lastIndexOf('.');
    if (dotIdx < 0) return null;

    let i = dotIdx - 1;
    let collected = '';
    let digitsSinceComma = 0;

    while (i >= 0) {
        const c = s[i];
        if (/\d/.test(c)) {
            collected = c + collected;
            digitsSinceComma++;
        } else if (c === ',' && digitsSinceComma === 3) {
            collected = ',' + collected;
            digitsSinceComma = 0;
        } else {
            break;
        }
        i--;
    }

    const afterDot = s.slice(dotIdx);
    if (!/^\.\d{2}$/.test(afterDot)) return null;

    const firstCommaPos = collected.indexOf(',');
    if (firstCommaPos < 0) {
        return /^\d+$/.test(collected) && !/^0/.test(collected) && collected.length <= 3
            ? { val: collected + afterDot, start: i + 1 }
            : null;
    }

    let isRefCodePattern = false;
    if (i + 1 >= 2) {
        const before2 = s[i];
        const before1 = s[i + 1];
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
    if (!last) {
        console.log('  No last money found');
        return { debit, kredit, saldo, amounts };
    }

    console.log('  Last money:', last);

    const beforeLast = rest.slice(0, last.start).trim();
    console.log('  Before last:', beforeLast);
    const second = findLastMoney(beforeLast);

    if (second) {
        console.log('  Second money:', second);
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

// Test case: 22/06 line from CSV
const testInput = 'SETORAN TUNAI75 SETOR TUNAI 7,363,884.00 8,243,931.00';

console.log('Testing parseLine with 22/06 input:');
console.log('Input:', testInput);
const result = parseLine(testInput);
console.log('\nResult:');
console.log('  kredit:', result.kredit, '(expected: 7,363,884.00)');
console.log('  saldo:', result.saldo, '(expected: 8,243,931.00)');
console.log('  amounts:', result.amounts);
