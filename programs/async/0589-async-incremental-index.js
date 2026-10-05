async function main() {
  async function* documents() {
    yield { id: 'a', words: ['red', 'sun'] };
    yield await Promise.resolve({ id: 'b', words: ['red', 'moon', 'red'] });
  }
  const index = new Map();
  for await (const document of documents()) {
    for (const word of document.words) {
      if (!index.has(word)) index.set(word, new Set());
      index.get(word).add(document.id);
    }
  }
  console.log(JSON.stringify(Array.from(index, ([word, ids]) => [word, Array.from(ids)])));
}
main().catch(error => { throw error; });
