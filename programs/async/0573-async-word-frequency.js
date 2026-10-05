async function main() {
  async function* paragraphs() {
    yield await Promise.resolve('Blue sky blue');
    yield await Promise.resolve('Green sky');
  }
  const counts = new Map();
  for await (const paragraph of paragraphs()) {
    for (const word of paragraph.toLowerCase().split(' ')) counts.set(word, (counts.get(word) || 0) + 1);
  }
  const ranking = Array.from(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  console.log(JSON.stringify(ranking));
}
main().catch(error => { throw error; });
