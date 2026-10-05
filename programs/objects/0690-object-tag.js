class Ticket {
  constructor(code) { this.code = code; }
  get [Symbol.toStringTag]() { return "Ticket"; }
  toJSON() { return { code: this.code.toUpperCase() }; }
}
const ticket = new Ticket("r7");
console.log(JSON.stringify({
  tag: Object.prototype.toString.call(ticket),
  ticket,
  ownKeys: Object.keys(ticket)
}));
