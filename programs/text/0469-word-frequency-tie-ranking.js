const words = 'Pear apple pear Banana apple pear BANANA'.toLowerCase().split(' ');
const counts = new Map();
for (const word of words) {
  counts.set(word, (counts.get(word) || 0) + 1);
}
const ranking = Array.from(counts, ([word, count]) => ({ word, count }));
ranking.sort((a, b) => b.count - a.count || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
const total = words.length;
const report = ranking.map(entry => ({ word: entry.word, count: entry.count, fraction: entry.count / total }));
console.log(JSON.stringify(report));
