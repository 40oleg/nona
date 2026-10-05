class Chain {
  constructor() { this.head = null; }
  prepend(value) { this.head = { value, next: this.head }; return this; }
  *[Symbol.iterator]() {
    for (let node = this.head; node; node = node.next) yield node.value;
  }
  removeHead() { const old = this.head; this.head = old?.next ?? null; return old?.value; }
}
const chain = new Chain().prepend(1).prepend(2).prepend(3);
console.log(JSON.stringify([chain.removeHead(), [...chain]]));
