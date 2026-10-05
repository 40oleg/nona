const documents = ['red red fox', 'red bird', 'blue fox fox'];
const terms = documents.map(text => text.split(' '));
const query = ['red', 'fox'];
const weights = new Map();
for (const word of query) {
  const count = terms.filter(words => words.includes(word)).length;
  weights.set(word, Math.log(1 + documents.length / (1 + count)));
}
const scores = terms.map((words, id) => ({ id, score: Number(query.reduce((sum, word) => sum + words.filter(w => w === word).length / words.length * weights.get(word), 0).toFixed(6)) }));
scores.sort((a, b) => b.score - a.score || a.id - b.id);
console.log(JSON.stringify(scores));
