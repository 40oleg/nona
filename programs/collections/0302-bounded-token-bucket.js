const events = [{tick:0,cost:2},{tick:0,cost:2},{tick:1,cost:2},{tick:3,cost:3}];
let tokens = 3;
let previousTick = 0;
const results = [];
for (const event of events) {
  tokens = Math.min(3,tokens+event.tick-previousTick);
  previousTick=event.tick;
  const accepted = tokens>=event.cost;
  if (accepted) tokens-=event.cost;
  results.push({tick:event.tick,accepted,tokens});
}
console.log(JSON.stringify(results));
