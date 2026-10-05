async function main() {
  const disposers = [];
  const events = [];
  async function acquire(name) {
    await Promise.resolve(); events.push('open:' + name);
    disposers.push(async () => { await Promise.resolve(); events.push('close:' + name); });
  }
  try {
    await acquire('database'); await acquire('cursor');
    events.push('read');
  } finally { while (disposers.length) await disposers.pop()(); }
  console.log(events.join('>'));
}
main().catch(error => { throw error; });
