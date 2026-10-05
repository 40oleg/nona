async function main() {
  let budget = 2;
  const attempts = new Map();
  const results = [];
  for (const key of ['alpha', 'beta', 'gamma']) {
    while (true) {
      attempts.set(key, (attempts.get(key) || 0) + 1);
      try {
        await Promise.resolve();
        if (attempts.get(key) === 1) throw new Error('transient');
        results.push(key + ':ok'); break;
      } catch (error) { if (budget-- <= 0) { results.push(key + ':exhausted'); break; } }
    }
  }
  console.log(JSON.stringify([results, Array.from(attempts)]));
}
main().catch(error => { throw error; });
