const macros = { strong: { arity: 1, body: '<b>#1</b>' }, pair: { arity: 2, body: '(#1,#2)' } };
const source = 'Use \\strong{nested {words}} and \\pair{left}{right}.';
let cursor = 0, result = '';
function argument() {
  if (source[cursor++] !== '{') throw new Error('expected argument');
  let depth = 1, value = '';
  while (depth && cursor < source.length) {
    const c = source[cursor++];
    if (c === '{') depth++;
    if (c === '}') depth--;
    if (depth) value += c;
  }
  if (depth) throw new Error('unclosed argument');
  return value;
}
while (cursor < source.length) {
  if (source[cursor] !== '\\') { result += source[cursor++]; continue; }
  cursor++;
  let name = '';
  while (cursor < source.length && /[a-z]/.test(source[cursor])) name += source[cursor++];
  const macro = macros[name];
  if (!macro) { result += '\\' + name; continue; }
  const argumentsList = [];
  for (let n = 0; n < macro.arity; n++) argumentsList.push(argument());
  result += macro.body.replace(/#([1-9])/g, (whole, index) => argumentsList[Number(index) - 1]);
}
console.log(result);
