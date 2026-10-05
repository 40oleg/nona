const lengths = [['A', 2], ['B', 2], ['C', 3], ['D', 3], ['E', 3], ['F', 3]];
const codes = new Map(), prefixes = new Set();
let code = 0, previousLength = 0;
for (const [symbol, length] of lengths) {
  code <<= length - previousLength;
  const bits = code.toString(2).padStart(length, '0');
  if (bits.length > length) throw new Error('oversubscribed code lengths');
  codes.set(bits, symbol);
  for (let n = 1; n < bits.length; n++) prefixes.add(bits.slice(0, n));
  code++;
  previousLength = length;
}
function decode(stream) {
  let pending = '', text = '';
  for (const bit of stream) {
    if (bit !== '0' && bit !== '1') return { text, error: 'non-bit' };
    pending += bit;
    if (codes.has(pending)) { text += codes.get(pending); pending = ''; }
    else if (!prefixes.has(pending)) return { text, error: 'unknown-code' };
  }
  return { text, error: pending ? 'truncated-code' : null };
}
console.log(JSON.stringify({ codes: Array.from(codes), decoded: ['0001100111110', '001', '00x'].map(decode) }));
