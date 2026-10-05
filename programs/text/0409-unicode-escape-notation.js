function escape(symbol) {
  const cp = symbol.codePointAt(0);
  if (cp <= 127) return symbol;
  if (cp <= 65535) return '\\u' + cp.toString(16).padStart(4, '0');
  return '\\u{' + cp.toString(16) + '}';
}
const text = 'Hi Ω😀';
const symbols = Array.from(text);
const escaped = symbols.map(escape).join('');
console.log(escaped);
