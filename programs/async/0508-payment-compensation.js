async function main() {
  let balance = 100;
  const undo = [];
  const events = [];
  try {
    await Promise.resolve();
    balance -= 30;
    undo.push(() => { balance += 30; events.push('refunded'); });
    await Promise.reject(new Error('seat unavailable'));
  } catch (error) {
    events.push(error.message);
    for (const action of undo.reverse()) await action();
  }
  console.log(JSON.stringify([balance, events]));
}
main().catch(error => { throw error; });
