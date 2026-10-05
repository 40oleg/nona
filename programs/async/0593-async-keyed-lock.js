async function main() {
  const tails = new Map();
  const balances = new Map([['a', 10], ['b', 20]]);
  const log = [];
  function update(key, delta) {
    const next = (tails.get(key) || Promise.resolve()).then(async () => {
      const before = balances.get(key);
      await Promise.resolve();
      balances.set(key, before + delta); log.push(key + ':' + balances.get(key));
    });
    tails.set(key, next); return next;
  }
  await Promise.all([update('a', 2), update('b', 5), update('a', 3)]);
  console.log(JSON.stringify([Array.from(balances), log]));
}
main().catch(error => { throw error; });
