const source = 'AΩ中1٢e\u0301!?😀';
const counts = { letter: 0, number: 0, mark: 0, punctuation: 0, other: 0 };
for (const c of source) {
  const category = /\p{Letter}/u.test(c) ? 'letter' : /\p{Number}/u.test(c) ? 'number' : /\p{Mark}/u.test(c) ? 'mark' : /\p{Punctuation}/u.test(c) ? 'punctuation' : 'other';
  const previous = counts[category];
  const next = previous + 1;
  counts[category] = next;
}
const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
console.log(JSON.stringify({ counts, total }));
