// Test extractTrailingMoney dari SETORAN TUNAI7510100,000,000.00

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

    const charBeforeCollected = i >= 0 ? s[i] : '';
    const hasLetterBefore = /[A-Za-z]/.test(charBeforeCollected);

    console.log(`Collected: "${collected}"`);
    console.log(`First comma pos: ${firstCommaPos}`);
    console.log(`Char before (at i=${i}): "${charBeforeCollected}"`);
    console.log(`Has letter: ${hasLetterBefore}`);

    let leadingDigits;
    if (hasLetterBefore) {
        if (firstCommaPos > 3) {
            const mod = (firstCommaPos + 1) % 3 || 3;
            leadingDigits = mod;
            console.log(`Using modulo: (${firstCommaPos}+1) % 3 = ${leadingDigits}`);
        } else {
            leadingDigits = firstCommaPos;
            console.log(`firstCommaPos <= 3, take all: ${leadingDigits}`);
        }
    } else {
        leadingDigits = null;
        const maxTry = Math.min(3, firstCommaPos);
        console.log(`No letter, trying 1-${maxTry}:`);

        for (let ld = maxTry; ld >= 1; ld--) {
            const idx = firstCommaPos - ld;
            if (idx < 0) continue;

            const candidate = collected.slice(idx);
            const isValid = /^\d{1,3}(,\d{3})*$/.test(candidate);
            const noLeadZero = !/^0/.test(candidate);
            console.log(`  ld=${ld}: candidate="${candidate}", valid=${isValid}, noLeadZero=${noLeadZero}`);
            
            if (isValid && noLeadZero) {
                leadingDigits = ld;
                console.log(`  → PICK!`);
                break;
            }
        }
        if (leadingDigits === null) return null;
    } else {
        // Has letter: also try 1-3, pick largest valid (same as no-letter)
        console.log(`Has letter, trying 1-${Math.min(3, firstCommaPos)}:`);

        leadingDigits = null;
        const maxTry = Math.min(3, firstCommaPos);
        for (let ld = maxTry; ld >= 1; ld--) {
            const idx = firstCommaPos - ld;
            if (idx < 0) continue;

            const candidate = collected.slice(idx);
            const isValid = /^\d{1,3}(,\d{3})*$/.test(candidate);
            const noLeadZero = !/^0/.test(candidate);
            console.log(`  ld=${ld}: candidate="${candidate}", valid=${isValid}, noLeadZero=${noLeadZero}`);
            
            if (isValid && noLeadZero) {
                leadingDigits = ld;
                console.log(`  → PICK!`);
                break;
            }
        }
        if (leadingDigits === null) return null;
    }
    }

    const startIdx = firstCommaPos - leadingDigits;
    if (startIdx < 0) return null;

    const bestMoney = collected.slice(startIdx) + afterDot;
    console.log(`startIdx: ${startIdx}, bestMoney: "${bestMoney}"`);
    
    if (!/^\d{1,3}(,\d{3})*\.\d{2}$/.test(bestMoney)) {
        console.log(`Format check FAILED`);
        return null;
    }

    const moneyStart = s.lastIndexOf(bestMoney);
    if (moneyStart < 0) return null;

    return { val: bestMoney, start: moneyStart };
}

const s = "SETORAN TUNAI7510100,000,000.00";
console.log(`Input: "${s}"\n`);
const result = extractTrailingMoney(s);
console.log(`\nResult: ${result ? `"${result.val}" at pos ${result.start}` : 'null'}`);
console.log(`Expected: "100,000,000.00"`);
