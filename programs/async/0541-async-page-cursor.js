async function main() {
  const pages = new Map([['start', { rows: ['a', 'b'], next: 'tail' }], ['tail', { rows: ['c'], next: null }]]);
  let cursor = 'start';
  const catalog = [];
  const visited = [];
  while (cursor !== null) {
    visited.push(cursor);
    const { rows, next } = await Promise.resolve(pages.get(cursor));
    catalog.push(...rows);
    cursor = next;
  }
  console.log(JSON.stringify([catalog, visited]));
}
main().catch(error => { throw error; });
