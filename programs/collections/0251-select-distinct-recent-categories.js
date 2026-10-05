const events = [{kind:"a",value:1},{kind:"b",value:2},{kind:"a",value:3},{kind:"c",value:4},{kind:"b",value:5}];
const seen = new Set();
const latest = [];
for (const event of events.slice().reverse()) {
  if (!seen.has(event.kind)) {
    seen.add(event.kind);
    latest.push(event);
  }
}
console.log(JSON.stringify(latest.slice(0,2)));
