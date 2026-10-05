function* groups(tokens) {
  let group = [];
  for (const token of tokens) {
    if (token === '|') { yield group; group = []; }
    else group.push(token);
  }
  if (group.length) yield group;
}
const chunks = [...groups(['a','b','|','c','|','d','e'])];
console.log(JSON.stringify(chunks));
console.log(chunks.map(chunk => chunk.join('')).join('/'));
