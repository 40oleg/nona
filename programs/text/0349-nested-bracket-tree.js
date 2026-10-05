const input = '[a,[b,c],d]';
let position = 0;
function parse() {
  if (input[position] !== '[') {
    let token = '';
    while (position < input.length && input[position] !== ',' && input[position] !== ']') token += input[position++];
    return token;
  }
  position++;
  const items = [];
  while (input[position] !== ']') { items.push(parse()); if (input[position] === ',') position++; }
  position++;
  return items;
}
console.log(JSON.stringify(parse()));
