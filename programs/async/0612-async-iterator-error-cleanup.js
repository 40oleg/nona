async function main() {
  let closed = false;
  const source = {
    [Symbol.asyncIterator]() {
      let next = 0;
      return { async next() { return { value: ++next, done: false }; }, async return() { closed = true; return { done: true }; } };
    }
  };
  let reason = '';
  try { for await (const value of source) { if (value === 2) throw new Error('consumer failed'); } }
  catch (error) { reason = error.message; }
  console.log(JSON.stringify([reason, closed]));
}
main().catch(error => { throw error; });
