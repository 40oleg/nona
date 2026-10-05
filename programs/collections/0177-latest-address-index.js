const updates = [{id:"a",rev:2,city:"York"},{id:"b",rev:1,city:"Rome"},{id:"a",rev:1,city:"Lima"}];
const latest = new Map();
for (const row of updates) {
  const previous = latest.get(row.id);
  if (!previous || row.rev > previous.rev) {
    latest.set(row.id, row);
  }
}
const result = Array.from(latest.values()).map(row => row.id + "=" + row.city);
result.sort();
console.log(result.join(";"));
