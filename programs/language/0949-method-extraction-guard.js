class Accumulator {
  constructor() {
    this.total = 0;
    this.add = amount => { this.total += amount; return this.total; };
  }
  reader() { return () => this.total; }
}
const instance = new Accumulator();
const {add} = instance, read = instance.reader();
add(3); add(5);
console.log(JSON.stringify({total:read(),same:instance.add === add}));
