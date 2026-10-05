const source = '<root><item>A</item><item>B</item></root>';
const tokens = source.match(/<[^>]+>|[^<]+/g);
const stack = [], leaves = [];
let valid = true;
for (const token of tokens) {
  if (token.startsWith('</')) { if (stack.pop() !== token.slice(2, -1)) valid = false; }
  else if (token[0] === '<') stack.push(token.slice(1, -1));
  else leaves.push([stack.join('/'), token]);
}
valid = valid && stack.length === 0;
console.log(JSON.stringify({ valid, leaves }));
