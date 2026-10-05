function queue() {
  const incoming = [], outgoing = []; let transfers = 0;
  return {put(value) { incoming.push(value); }, take() { if (!outgoing.length) while (incoming.length) { outgoing.push(incoming.pop()); transfers++; } return outgoing.length ? outgoing.pop() : 'empty'; }, stats() { return transfers; }};
}
const messages = queue(); messages.put('a'); messages.put('b');
const answer = [messages.take()]; messages.put('c');
answer.push(messages.take(), messages.take(), messages.take());
console.log(answer.join(',') + ':' + messages.stats());
