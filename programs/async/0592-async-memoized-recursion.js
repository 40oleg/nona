async function main() {
  const memo = new Map([[0, Promise.resolve(0)], [1, Promise.resolve(1)]]);
  function fibonacci(n) {
    if (!memo.has(n)) memo.set(n, (async () => {
      const [a, b] = await Promise.all([fibonacci(n - 1), fibonacci(n - 2)]);
      return a + b;
    })());
    return memo.get(n);
  }
  const values = await Promise.all([fibonacci(8), fibonacci(6), fibonacci(8)]);
  console.log(JSON.stringify([values, memo.size]));
}
main().catch(error => { throw error; });
