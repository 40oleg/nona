const input = 'ＡＢＣ１２３！　hello';
let output = '';
const changed = [];
for (const symbol of input) {
  const cp = symbol.codePointAt(0);
  const folded = cp === 12288 ? ' ' : cp >= 65281 && cp <= 65374 ? String.fromCodePoint(cp - 65248) : symbol;
  if (folded !== symbol) changed.push([symbol, folded]);
  output += folded;
}
console.log(JSON.stringify({ output, changed }));
