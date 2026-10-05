const text = 'A中e\u0301😀';
let columns = 0;
const parts = [];
for (const symbol of text) {
  const code = symbol.codePointAt(0);
  const width = /\p{Mark}/u.test(symbol) ? 0 : code >= 4352 && (code <= 40959 || code >= 127744) ? 2 : 1;
  columns += width;
  parts.push([symbol, width]);
}
console.log(JSON.stringify({ columns, parts }));
