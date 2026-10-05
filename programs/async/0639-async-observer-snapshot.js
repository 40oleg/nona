async function main() {
  const listeners = new Set();
  const seen = [];
  const once = async event => { await Promise.resolve(); seen.push('once:' + event); listeners.delete(once); };
  const always = async event => { await Promise.resolve(); seen.push('always:' + event); };
  listeners.add(once); listeners.add(always);
  async function emit(event) { await Promise.all(Array.from(listeners, listener => listener(event))); }
  await emit('first');
  await emit('second');
  console.log(JSON.stringify([seen, listeners.size]));
}
main().catch(error => { throw error; });
