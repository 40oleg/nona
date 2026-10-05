const documents = ['red fox jumps', 'blue fox sleeps', 'red bird sleeps'];
const index = new Map();
documents.forEach((document, id) => {
  for (const word of new Set(document.split(' '))) {
    if (!index.has(word)) index.set(word, []);
    index.get(word).push(id);
  }
});
const query = ['red', 'sleeps'];
const hits = (index.get(query[0]) || []).filter(id => query.every(word => (index.get(word) || []).includes(id)));
console.log(JSON.stringify({ postings: Array.from(index), hits }));
