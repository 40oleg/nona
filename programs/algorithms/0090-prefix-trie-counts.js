function node() { return {children: new Map(), count: 0, terminal: false}; }
const root = node();
for (const word of ['tea', 'team', 'ten', 'to']) {
  let cursor = root; cursor.count++;
  for (const letter of word) { if (!cursor.children.has(letter)) cursor.children.set(letter, node()); cursor = cursor.children.get(letter); cursor.count++; }
  cursor.terminal = true;
}
function lookup(prefix) { let cursor = root; for (const c of prefix) { cursor = cursor.children.get(c); if (!cursor) return '0:false'; } return cursor.count + ':' + cursor.terminal; }
console.log(['te', 'tea', 'toast'].map(lookup).join('|'));
