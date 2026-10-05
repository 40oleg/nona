async function main() {
  const capacity = 5;
  const best = Array(capacity + 1).fill(0);
  const items = [{ weight: 2, value: 6 }, { weight: 3, value: 9 }, { weight: 4, value: 10 }];
  for (const item of items) {
    const { weight, value } = await Promise.resolve(item);
    for (let remaining = capacity; remaining >= weight; remaining--) {
      best[remaining] = Math.max(best[remaining], best[remaining - weight] + value);
    }
  }
  console.log(JSON.stringify(best));
}
main().catch(error => { throw error; });
