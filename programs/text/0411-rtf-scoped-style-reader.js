const source = '{\\b Bold {\\i both} plain\\b0 normal}';
const groups = [], spans = [];
let style = { bold: false, italic: false }, text = '', cursor = 0;
function flush() {
  if (text) spans.push({ text, bold: style.bold, italic: style.italic });
  text = '';
}
while (cursor < source.length) {
  const c = source[cursor++];
  if (c === '{') { flush(); groups.push({ ...style }); }
  else if (c === '}') { flush(); style = groups.pop(); }
  else if (c === '\\') {
    if ('{}\\'.includes(source[cursor])) { text += source[cursor++]; continue; }
    let word = '', parameter = '';
    while (cursor < source.length && /[a-z]/.test(source[cursor])) word += source[cursor++];
    if (source[cursor] === '-') parameter += source[cursor++];
    while (cursor < source.length && /[0-9]/.test(source[cursor])) parameter += source[cursor++];
    if (source[cursor] === ' ') cursor++;
    if (word === 'b' || word === 'i') {
      flush();
      style[word === 'b' ? 'bold' : 'italic'] = parameter !== '0';
    } else if (word === 'par') text += '\n';
  } else text += c;
}
flush();
console.log(JSON.stringify(spans));
