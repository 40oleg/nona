class Cursor {
  #position = 0;
  constructor(items) { this.items = items; }
  next() { return this.items[this.#position++] ?? "end"; }
  bookmark() { const position = this.#position; return () => { this.#position = position; }; }
  get position() { return this.#position; }
}
const cursor = new Cursor(["a", "b", "c"]);
const log = [cursor.next()]; const rewind = cursor.bookmark();
log.push(cursor.next(), cursor.next()); rewind(); log.push(cursor.next(), cursor.position);
console.log(JSON.stringify(log));
