const records = [{id:"a",v:1},{id:"b",v:2},{id:"a",v:3},{id:"c",v:4},{id:"b",v:5}];
const seen = new Set();
const kept = records.slice().reverse().filter(record => {
  if (seen.has(record.id)) return false;
  seen.add(record.id);
  return true;
}).reverse();
const dropped = records.length-kept.length;
const result = {kept,dropped};
console.log(JSON.stringify(result));
