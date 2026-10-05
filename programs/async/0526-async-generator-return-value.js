async function main() {
  async function* exportRows() {
    let count = 0;
    for (const row of ['a', 'b', 'c']) { count++; yield await Promise.resolve(row); }
    return { exported: count };
  }
  const iterator = exportRows();
  const rows = [];
  let result = await iterator.next();
  while (!result.done) { rows.push(result.value); result = await iterator.next(); }
  console.log(JSON.stringify([rows, result.value]));
}
main().catch(error => { throw error; });
