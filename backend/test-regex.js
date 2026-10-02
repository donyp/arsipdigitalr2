const patterns = [
    /^\d{1,3}(,\d{3})*$/,
    /^\d{1,3}(?:,\d{3})*$/,
    /^\d{1,3}(?:,\d{3})+$/
];

const tests = ['8,000,000', '88,000,000', '100,000,000', '23,625,000'];

console.log('Testing money patterns:\n');
for (const s of tests) {
    console.log(`"${s}"`);
    patterns.forEach((p, i) => {
        const match = p.test(s);
        console.log(`  Pattern ${i}: ${match}`);
    });
    console.log();
}
