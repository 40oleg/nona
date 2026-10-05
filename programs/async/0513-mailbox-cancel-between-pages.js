async function main() {
  const control = { cancelled: false };
  const visited = [];
  async function* pages() {
    try {
      for (let page = 1; page <= 5 && !control.cancelled; page++) {
        yield await Promise.resolve('page-' + page);
      }
    } finally { visited.push('closed'); }
  }
  for await (const page of pages()) {
    visited.push(page);
    if (page === 'page-2') control.cancelled = true;
  }
  console.log(JSON.stringify(visited));
}
main().catch(error => { throw error; });
