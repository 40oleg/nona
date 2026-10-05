const requests = [['x', 3, 4], ['y', 2, 3], ['z', 2, 8]].sort((a, b) => a[2] - b[2]);
let clock = 0, violation = ''; const order = [];
for (const [name, duration, deadline] of requests) {
  clock += duration; order.push(name);
  if (clock > deadline && !violation) violation = name + ':' + (clock - deadline);
}
console.log(order.join('>') + ':' + (violation || 'on-time'));
