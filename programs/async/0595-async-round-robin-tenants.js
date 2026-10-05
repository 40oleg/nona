async function main() {
  const tenants = new Map([['red', [1, 2, 3]], ['blue', [4]], ['gold', [5, 6]]]);
  const log = [];
  let remaining = 6;
  while (remaining > 0) {
    for (const [tenant, jobs] of tenants) {
      if (!jobs.length) continue;
      const job = jobs.shift();
      log.push(await Promise.resolve(tenant + ':' + job));
      remaining--;
    }
  }
  console.log(log.join(','));
}
main().catch(error => { throw error; });
