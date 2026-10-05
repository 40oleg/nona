async function main() {
  const listeners = new Set();
  const events = [];
  function cancel() { for (const listener of listeners) listener(); }
  async function operation() {
    const onCancel = () => events.push('cancelled');
    listeners.add(onCancel);
    try { return await Promise.resolve('done'); }
    finally { listeners.delete(onCancel); }
  }
  events.push(await operation());
  cancel();
  console.log(JSON.stringify([events, listeners.size]));
}
main().catch(error => { throw error; });
