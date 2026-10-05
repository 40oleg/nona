async function main() {
  const pages = [5, 2, 8, 1, 4];
  const result = [];
  const windows = [];
  for (let start = 0; start < pages.length; start += 2) {
    const window = pages.slice(start, start + 2);
    windows.push(window.length);
    const values = await Promise.all(window.map(async page => 'page:' + await Promise.resolve(page * 10)));
    result.push(...values);
  }
  console.log(JSON.stringify([result, windows]));
}
main().catch(error => { throw error; });
