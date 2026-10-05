const leases = new Map();
const events = [{tick:1,user:"a",ttl:3},{tick:2,user:"b",ttl:2},{tick:3,user:"a",ttl:4},{tick:5,user:"c",ttl:1}];
const snapshots = [];
for (const event of events) {
  for (const [user,expiry] of leases) if (expiry<=event.tick) leases.delete(user);
  leases.set(event.user,event.tick+event.ttl);
  snapshots.push(Array.from(leases.keys()));
}
const expires = Array.from(leases);
console.log(JSON.stringify({snapshots,expires}));
