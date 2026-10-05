const text = 'a😀Ω𝄞z';
const entries = [];
let offset = 0;
for (const symbol of text) {
  const codePoint = symbol.codePointAt(0);
  entries.push({ symbol, codePoint, offset, units: symbol.length });
  offset += symbol.length;
}
const lengths = { units: text.length, points: entries.length };
console.log(JSON.stringify({ entries, lengths }));
