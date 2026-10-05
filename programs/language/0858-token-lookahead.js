class Tokens {
  constructor(items) { this.items = items; this.at = 0; }
  take(expected) {
    const value = this.items[this.at++];
    if (expected && value !== expected) throw new Error('expected '+expected);
    return value;
  }
  more() { return this.at < this.items.length; }
}
const stream = new Tokens(['a','=','3',';','b','=','7',';']), values = {};
while (stream.more()) { const key = stream.take(); stream.take('='); values[key] = Number(stream.take()); stream.take(';'); }
const {a,b} = values;
console.log(JSON.stringify({values,total:a+b}));
