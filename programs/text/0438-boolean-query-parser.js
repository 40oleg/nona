const tokens = '(red OR blue) AND NOT bird'.match(/[()]|[A-Za-z]+/g);
const terms = new Set(['red', 'fox']);
let at = 0;
function atom() {
  if (tokens[at] === 'NOT') { at++; return !atom(); }
  if (tokens[at] === '(') { at++; const value = either(); at++; return value; }
  return terms.has(tokens[at++]);
}
function both() { let value = atom(); while (tokens[at] === 'AND') { at++; const next = atom(); value = value && next; } return value; }
function either() { let value = both(); while (tokens[at] === 'OR') { at++; const next = both(); value = value || next; } return value; }
console.log(JSON.stringify({ match: either(), consumed: at }));
