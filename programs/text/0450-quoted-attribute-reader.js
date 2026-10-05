const source = 'id="main" disabled data-x=7 title=\'two words\'';
const attributes = {};
let i = 0;
while (i < source.length) {
  while (source[i] === ' ') i++;
  let name = '';
  while (i < source.length && source[i] !== ' ' && source[i] !== '=') name += source[i++];
  let value = true;
  if (source[i] === '=') {
    i++; value = ''; const quote = source[i] === '"' || source[i] === "'" ? source[i++] : '';
    while (i < source.length && (quote ? source[i] !== quote : source[i] !== ' ')) value += source[i++];
    if (quote) i++;
  }
  attributes[name] = value;
}
console.log(JSON.stringify(attributes));
