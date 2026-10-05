const root = {};
for (const word of ['cat', 'car', 'cart', 'dog']) {
  let node = root;
  for (const c of word) { if (!node[c]) node[c] = {}; node = node[c]; }
  node.end = true;
}
const prefix = 'car';
let node = root;
for (const c of prefix) node = node[c];
const matches = [];
function collect(branch, word) { if (branch.end) matches.push(word); for (const key of Object.keys(branch)) if (key !== 'end') collect(branch[key], word + key); }
collect(node, prefix);
console.log(JSON.stringify(matches));
