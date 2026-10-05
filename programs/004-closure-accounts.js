// An escaped arrow retains this and accesses a private field after allocation.
class Account {
  #balance;
  constructor(initial) { this.#balance = initial; }
  add(amount) { this.#balance += amount; return this.#balance; }
  reader() { return () => this.#balance; }
}

const first = new Account(10);
const readFirst = first.reader();
const second = new Account(100);
console.log(first.add(5), first.add(-3), second.add(2), readFirst());

const callbacks = [];
for (let i = 0; i < 4; i++) callbacks.push(() => i * i);
const squares = [];
for (let i = 0; i < callbacks.length; i++) squares.push(callbacks[i]());
console.log(squares.join(','));
