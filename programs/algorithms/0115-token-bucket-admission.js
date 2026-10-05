const events = [[0, 2], [1, 2], [3, 1], [4, 3], [8, 3]], capacity = 3;
let tokens = capacity, previous = 0; const decisions = [];
for (const [time, demand] of events) {
  tokens = Math.min(capacity, tokens + time - previous); previous = time;
  const accepted = tokens >= demand; if (accepted) tokens -= demand;
  decisions.push(time + ':' + accepted + ':' + tokens);
}
if (tokens < 0 || tokens > capacity) throw new Error('bucket');
console.log(decisions.join('|'));
