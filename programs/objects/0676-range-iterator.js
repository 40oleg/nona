class Range {
  constructor(start, stop, step) { Object.assign(this, { start, stop, step }); }
  *[Symbol.iterator]() {
    for (let n = this.start; n < this.stop; n += this.step) yield n;
  }
  includes(value) {
    return [...this].some(n => n === value);
  }
}
const range = new Range(2, 11, 3);
console.log(JSON.stringify([[...range], range.includes(8), range.includes(9)]));
