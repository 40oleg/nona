let row = new Uint8Array([1]); const pattern = [];
for (let n = 0; n < 8; n++) {
  for (let k = 0; k <= n; k++) if (row[k] !== ((k & n) === k ? 1 : 0)) throw new Error('Lucas parity');
  pattern.push(Array.from(row, bit => bit ? '#' : '.').join(''));
  const next = new Uint8Array(row.length + 1); next[0] = 1; next[next.length - 1] = 1;
  for (let k = 1; k < next.length - 1; k++) next[k] = row[k - 1] ^ row[k];
  row = next;
}
console.log(pattern.join('/'));
