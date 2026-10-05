class Worker {
  constructor(name) { this.name = name; }
  summary() { return this.name + ":" + this.pay(); }
}
class Hourly extends Worker {
  constructor(name, hours, rate) { super(name); this.hours = hours; this.rate = rate; }
  pay() { return this.hours * this.rate; }
}
class Salaried extends Worker { pay() { return 100; } }
const staff = [new Hourly("A", 4, 12), new Salaried("B")];
console.log(JSON.stringify(staff.map(person => person.summary())));
