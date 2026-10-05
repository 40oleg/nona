async function main() {
  let tail = Promise.resolve();
  let balance = 50;
  const audit = [];
  function transfer(amount) {
    const job = tail.then(async () => {
      const before = balance;
      await Promise.resolve();
      balance = before + amount;
      audit.push(balance);
    });
    tail = job;
    return job;
  }
  await Promise.all([transfer(-10), transfer(30), transfer(-5)]);
  console.log(JSON.stringify([balance, audit]));
}
main().catch(error => { throw error; });
