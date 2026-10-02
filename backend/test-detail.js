// Debug detail

const s = "SETORAN TUNAI7510100,000,000.00";
const dotIdx = s.lastIndexOf('.');

let i = dotIdx - 1;
let collected = '';
let digitsSinceComma = 0;
let validCommaGroups = 0;

let afterDot = s.slice(dotIdx);

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

console.log(`String: "${s}"`);
console.log(`Collected: "${collected}"`);
console.log(`First comma pos: ${collected.indexOf(',')}`);
console.log(`Char before collected (at i=${i}): "${s[i]}"`);
console.log(`Has letter before: ${/[A-Za-z]/.test(s[i])}`);

const firstCommaPos = collected.indexOf(',');
const maxTry = Math.min(3, firstCommaPos);

console.log(`\nTrying ld from ${maxTry} down to 1:`);
for (let ld = maxTry; ld >= 1; ld--) {
    const idx = firstCommaPos - ld;
    const candidate = collected.slice(idx);
    const isValid = /^\d{1,3}(,\d{3})*$/.test(candidate);
    const noLeadingZero = !/^0/.test(candidate);
    console.log(`  ld=${ld}: idx=${idx}, candidate="${candidate}", valid=${isValid}, noLeadZero=${noLeadingZero}`);
    if (isValid && noLeadingZero) {
        console.log(`  → PICK!`);
        break;
    }
}
