async function main() {
  const transitions = new Map([['idle:HELLO', 'identified'], ['identified:AUTH', 'authorized'], ['authorized:DATA', 'complete']]);
  let state = 'idle';
  const history = [state];
  for (const message of ['HELLO', 'AUTH', 'DATA']) {
    const input = await Promise.resolve(message);
    const next = transitions.get(state + ':' + input);
    if (!next) throw new Error('invalid transition');
    state = next;
    history.push(state);
  }
  console.log(history.join('>'));
}
main().catch(error => { throw error; });
