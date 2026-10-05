async function main() {
  const a = [[1, 2], [3, 4]];
  const b = [[5, 6], [7, 8]];
  const product = await Promise.all(a.map(async row => {
    const result = [];
    for (let column = 0; column < 2; column++) {
      const value = row.reduce((sum, entry, index) => sum + entry * b[index][column], 0);
      result.push(await Promise.resolve(value));
    }
    return result;
  }));
  console.log(JSON.stringify(product));
}
main().catch(error => { throw error; });
