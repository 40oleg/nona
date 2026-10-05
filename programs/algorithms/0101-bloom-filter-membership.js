const bits = new Uint8Array(31);
function hashes(word) { let a = 0, b = 7; for (const c of word) { a = (a * 5 + c.charCodeAt(0)) % 31; b = (b * 11 + c.charCodeAt(0)) % 31; } return [a, b]; }
for (const word of ['oak', 'elm', 'ash']) for (const hash of hashes(word)) bits[hash] = 1;
const mayContain = word => hashes(word).every(hash => bits[hash] === 1);
if (!mayContain('oak')) throw new Error('false negative');
console.log(['oak', 'elm', 'pine', 'fir'].map(word => word + ':' + mayContain(word)).join(','));
