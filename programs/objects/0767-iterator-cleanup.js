class Scan {
  constructor(values) { this.values = values; this.closed = false; }
  *[Symbol.iterator]() {
    try { for (const value of this.values) yield value; }
    finally { this.closed = true; }
  }
}
const scan = new Scan([2, 4, 6, 8]);
const accepted = [];
for (const value of scan) { if (value > 4) break; accepted.push(value); }
console.log(JSON.stringify([accepted, scan.closed]));
