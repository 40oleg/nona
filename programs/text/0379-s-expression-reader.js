const tokens = '(sum 1 (mul 2 3) x)'.match(/[()]|[^\s()]+/g);
let cursor = 0;
function read() {
  const token = tokens[cursor++];
  if (token !== '(') return /^-?\d+$/.test(token) ? Number(token) : token;
  const list = [];
  while (tokens[cursor] !== ')') list.push(read());
  cursor++;
  return list;
}
const tree = read();
console.log(JSON.stringify({ tree, tokenCount: cursor }));
