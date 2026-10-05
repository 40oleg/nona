const incoming = [{id:"a",seq:2,value:8},{id:"a",seq:1,value:4},{id:"b",seq:1,value:3},{id:"a",seq:3,value:9}];
const stored = new Map();
let stale = 0;
for (const row of incoming) {
  const previous = stored.get(row.id);
  if (previous && row.seq<=previous.seq) stale++;
  else stored.set(row.id,{seq:row.seq,value:row.value});
}
const final = Array.from(stored);
console.log(JSON.stringify({final,stale}));
