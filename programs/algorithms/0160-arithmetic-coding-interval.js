const ranges = new Map([['A', [0, 0.5]], ['B', [0.5, 0.75]], ['C', [0.75, 1]]]);
let low = 0, high = 1; const message = 'ABCA';
for (const symbol of message) { const [a, b] = ranges.get(symbol), width = high - low; high = low + width * b; low += width * a; }
let code = (low + high) / 2, decoded = '';
for (let i = 0; i < message.length; i++) {
  for (const [symbol, [a, b]] of ranges) if (code >= a && code < b) { decoded += symbol; code = (code - a) / (b - a); break; }
}
if (decoded !== message) throw new Error('round trip');
console.log(low + ':' + high + ':' + decoded);
