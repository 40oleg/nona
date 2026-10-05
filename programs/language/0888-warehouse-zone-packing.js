const zones = [{name:'cold',capacity:6,accept:order => order.chilled},{name:'dry',capacity:5,accept:order => !order.chilled}];
const orders = [{id:'milk',size:4,chilled:true},{id:'ice',size:3,chilled:true},{id:'rice',size:2,chilled:false},{id:'flour',size:4,chilled:false}];
const assignments = [], remaining = [];
const packed = new Set();
for (const {name,capacity,accept} of zones) {
  let available = capacity;
  const fit = order => accept(order) && order.size <= available;
  for (const order of orders) {
    if (!packed.has(order.id) && fit(order)) { available -= order.size; packed.add(order.id); assignments.push({order:order.id,zone:name}); }
  }
  remaining.push({zone:name,available});
}
console.log(JSON.stringify({assignments,remaining,unpacked:orders.filter(order => !packed.has(order.id)).map(order => order.id),packed:[...packed]}));
