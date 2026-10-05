async function main() {
  let produced = 0;
  let closed = false;
  async function* range() {
    try {
      for (let i = 0; i < 100; i++) { produced++; yield await Promise.resolve(i * i); }
    } finally { closed = true; }
  }
  const prefix = [];
  for await (const value of range()) { prefix.push(value); if (prefix.length === 3) break; }
  console.log(JSON.stringify([prefix, produced, closed]));
}
main().catch(error => { throw error; });
