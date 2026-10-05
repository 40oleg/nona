const start = 50, requests = [10, 70, 30, 90, 50];
const up = requests.filter(x => x >= start).sort((a, b) => a - b);
const down = requests.filter(x => x < start).sort((a, b) => b - a);
const order = [...up, ...down]; let position = start, travel = 0;
for (const sector of order) { travel += Math.abs(sector - position); position = sector; }
if (order.length !== requests.length) throw new Error('lost request');
console.log(travel + ':' + order.join(','));
