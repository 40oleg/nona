async function main() {
  const undo = [];
  const trace = [];
  async function open(name) {
    await Promise.resolve();
    if (name === 'printer') throw new Error('unavailable:' + name);
    trace.push('open:' + name);
    undo.push(async () => trace.push('close:' + name));
  }
  try { await open('file'); await open('printer'); }
  catch (error) { trace.push(error.message); for (const close of undo.reverse()) await close(); }
  console.log(trace.join('|'));
}
main().catch(error => { throw error; });
