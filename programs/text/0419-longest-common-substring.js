const a = 'blueberry', b = 'blackberry';
let previous = Array(b.length + 1).fill(0), best = 0, end = 0;
for (let i = 1; i <= a.length; i++) {
  const row = Array(b.length + 1).fill(0);
  for (let j = 1; j <= b.length; j++) {
    if (a[i - 1] === b[j - 1]) row[j] = previous[j - 1] + 1;
    if (row[j] > best) { best = row[j]; end = i; }
  }
  previous = row;
}
console.log(JSON.stringify({ length: best, substring: a.slice(end - best, end) }));
