const size = 8, tree = new Int32Array(size * 2); tree.fill(2147483647);
[7, 4, 9, 2, 6].forEach((value, i) => { tree[size + i] = value; });
for (let i = size - 1; i > 0; i--) tree[i] = Math.min(tree[i * 2], tree[i * 2 + 1]);
function replace(index, value) { let p = size + index; tree[p] = value; while (p > 1) { p >>= 1; tree[p] = Math.min(tree[p * 2], tree[p * 2 + 1]); } }
function minimum(start, end) { let answer = Infinity; for (let l = size + start, r = size + end; l < r; l >>= 1, r >>= 1) { if (l & 1) answer = Math.min(answer, tree[l++]); if (r & 1) answer = Math.min(answer, tree[--r]); } return answer; }
const before = minimum(1, 5); replace(3, 10);
console.log(before + ':' + minimum(1, 5));
