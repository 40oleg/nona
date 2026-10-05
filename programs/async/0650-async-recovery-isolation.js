async function main() {
  const log = [];
  const good = Promise.resolve(9).then(value => { log.push('good'); return value * 2; });
  const bad = Promise.reject(new Error('broken')).catch(error => {
    log.push(error.message);
    return 0;
  });
  const [a, b] = await Promise.all([good, bad]);
  const combined = a + b;
  console.log(JSON.stringify([combined, log]));
}
main().catch(error => { throw error; });
