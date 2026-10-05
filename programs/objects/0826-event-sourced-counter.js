class CounterProjection {
  constructor(events) { this.events = events.slice(); }
  get value() { return this.events.reduce((value, event) => event.type === "reset" ? 0 : value + event.amount, 0); }
  add(amount) { this.events.push({ type: "add", amount }); }
  reset() { this.events.push({ type: "reset" }); }
  fork() { return new CounterProjection(this.events); }
}
const original = new CounterProjection([{ type: "add", amount: 4 }]), fork = original.fork();
original.add(3); fork.reset(); fork.add(2);
console.log(JSON.stringify([original.value, fork.value, original.events.length, fork.events.length]));
