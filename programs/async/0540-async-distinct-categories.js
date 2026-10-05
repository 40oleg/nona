async function main() {
  async function* events() {
    for (const category of ['news', 'sport', 'news', 'art', 'sport']) yield await Promise.resolve(category);
  }
  const seen = new Set();
  const unique = [];
  for await (const category of events()) {
    if (seen.has(category)) continue;
    seen.add(category);
    unique.push(category.toUpperCase());
  }
  console.log(unique.join(','));
}
main().catch(error => { throw error; });
