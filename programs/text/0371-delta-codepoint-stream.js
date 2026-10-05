const symbols = Array.from('abcΩΨ😀');
let previous = 0;
const deltas = symbols.map(symbol => {
  const value = symbol.codePointAt(0);
  const delta = value - previous;
  previous = value;
  return delta;
});
let current = 0;
const restored = deltas.map(delta => { current += delta; return String.fromCodePoint(current); }).join('');
console.log(JSON.stringify({ deltas, restored }));
