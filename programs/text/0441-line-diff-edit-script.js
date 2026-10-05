const before = ['alpha', 'beta', 'gamma'], after = ['alpha', 'delta', 'gamma', 'omega'];
const table = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));
for (let i = before.length - 1; i >= 0; i--) for (let j = after.length - 1; j >= 0; j--) table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
let i = 0, j = 0;
const edits = [];
while (i < before.length || j < after.length) {
  if (i < before.length && j < after.length && before[i] === after[j]) { edits.push(['=', before[i]]); i++; j++; }
  else if (j < after.length && (i === before.length || table[i][j + 1] >= table[i + 1][j])) edits.push(['+', after[j++]]);
  else edits.push(['-', before[i++]]);
}
console.log(JSON.stringify(edits));
