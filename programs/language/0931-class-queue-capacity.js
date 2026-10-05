class Queue {
  constructor(capacity) { this.capacity = capacity; this.items = []; }
  add(...items) {
    if (this.items.length+items.length > this.capacity) throw new Error('full');
    this.items.push(...items);
  }
  drain(count) { return this.items.splice(0,count); }
}
const queue = new Queue(3); queue.add('a','b');
try { queue.add('c','d'); } catch(error) { console.log(error.message); }
console.log(JSON.stringify(queue.drain(1))); queue.add('c');
console.log(JSON.stringify(queue.items));
