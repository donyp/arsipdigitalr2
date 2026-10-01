// Test exact case from user

function extractTrailingMoney(s) {
    const dotIdx = s.lastIndexOf('.');
    if (dotIdx < 0) return null;

    let i = dotIdx - 1;
    let collected = '';
    let digitsSinceComma = 0;
    let validCommaGroups = 0;

    let afterDot = s.slice(dotIdx);
    if (!/^\.\d{2}$/.test(afterDot)) return null;

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

    let isRefCodePattern = false;
    if (i >= 2) {
        const before3 = s[i-2];
        const before2 = s[i-1];
        const before1 = s[i];
        if (/[A-Z]/.test(before2) && /[A-Z]/.test(before1) && !/[A-Za-z]/.test(before3)) {
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

    // Trim rest to remove trailing/leading whitespace that breaks extraction
    rest = rest.trim();
    
    const last = findLastMoney(rest);
    console.log(`\nlast money: ${last ? `"${last.val}" at pos ${last.start}` : 'null'}`);
    
    if (!last) return { debit, kredit, saldo, amounts };

    const beforeLast = rest.slice(0, last.start).trim();
    console.log(`beforeLast: "${beforeLast}"`);
    
    const second = findLastMoney(beforeLast);
    console.log(`second money: ${second ? `"${second.val}" at pos ${second.start}` : 'null'}`);

    if (second) {
        kredit = second.val;
        saldo = last.val;
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

// Test
const line = "22/06 SETORAN TUNAI SETOR TUNAI 7510 7,363,884.00 8,243,931.00";
console.log(`Full line: "${line}"\n`);

const dateMatch = line.match(/^(\d{2}\/\d{2})(.*)/);
if (dateMatch) {
    const [, tgl, rest] = dateMatch;
    console.log(`Date: "${tgl}"`);
    console.log(`Rest: "${rest}"\n`);
    
    const result = parseLine(rest);
    console.log(`Debit: "${result.debit}"`);
    console.log(`Kredit: "${result.kredit}"`);
    console.log(`Saldo: "${result.saldo}"`);
    console.log(`Amounts to remove: [${result.amounts.map(a => `"${a}"`).join(', ')}]`);
    
    console.log(`\nExpected:`);
    console.log(`Kredit: "7,363,884.00"`);
    console.log(`Saldo: "8,243,931.00"`);
}
