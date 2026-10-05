const clients = [{id: 'a', weight: 1, served: 0}, {id: 'b', weight: 2, served: 0}, {id: 'c', weight: 3, served: 0}];
const timeline = [];
for (let slot = 0; slot < 12; slot++) {
  clients.sort((a, b) => a.served * b.weight - b.served * a.weight || a.id.localeCompare(b.id));
  clients[0].served++; timeline.push(clients[0].id);
}
clients.sort((a, b) => a.id.localeCompare(b.id));
console.log(timeline.join('') + ':' + clients.map(c => c.id + '=' + c.served).join(','));
