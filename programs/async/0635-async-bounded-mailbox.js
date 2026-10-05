async function main() {
  const queue = [];
  const waiting = [];
  const trace = [];
  async function send(value) {
    if (queue.length >= 2) await new Promise(resolve => waiting.push(resolve));
    queue.push(value); trace.push('sent:' + value);
  }
  function receive() { const value = queue.shift(); if (waiting.length) waiting.shift()(); return value; }
  await send('a'); await send('b');
  const third = send('c');
  trace.push('received:' + receive());
  await third;
  console.log(JSON.stringify([queue, trace]));
}
main().catch(error => { throw error; });
