async function main() {
  async function sum(label, ...values) {
    const resolved = await Promise.all(values);
    const total = resolved.reduce((result, value) => result + value, 0);
    return label + ':' + total;
  }
  const first = await sum('numbers', Promise.resolve(2), 5, Promise.resolve(7));
  const second = await sum('empty');
  const output = [first, second];
  console.log(JSON.stringify(output));
}
main().catch(error => { throw error; });
