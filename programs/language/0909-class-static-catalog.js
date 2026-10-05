class Entry {
  constructor(code,price) { this.code = code; this.price = price; }
  static parse(text) {
    const [code,price] = text.split(':');
    if (!code || Number(price) < 0) throw new Error('bad entry');
    return new Entry(code,Number(price));
  }
  discounted(rate) { return new Entry(this.code,this.price*(1-rate)); }
}
const entry = Entry.parse('book:20').discounted(0.25);
console.log(JSON.stringify(entry));
try { Entry.parse('bad:-1'); } catch(e) { console.log(e.message); }
