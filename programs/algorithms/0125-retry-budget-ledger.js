const outcomes = new Map([['upload', ['busy', 'busy', 'ok']], ['delete', ['denied', 'ok']], ['sync', ['busy', 'busy', 'busy']]]);
const results = [];
for (const [name, responses] of outcomes) {
  let attempts = 0, status = 'exhausted';
  for (const response of responses) {
    if (attempts === 3) break; attempts++;
    if (response === 'ok') { status = 'done'; break; }
    if (response !== 'busy') { status = 'permanent'; break; }
  }
  results.push(name + ':' + status + ':' + attempts);
}
console.log(results.join('|'));
