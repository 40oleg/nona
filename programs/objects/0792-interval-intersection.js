class Interval {
  constructor(start, end) { if (start > end) throw new Error("inverted"); this.start = start; this.end = end; }
  intersect(other) {
    const start = Math.max(this.start, other.start), end = Math.min(this.end, other.end);
    return start <= end ? new Interval(start, end) : null;
  }
  contains(value) { return value >= this.start && value <= this.end; }
  toJSON() { return [this.start, this.end]; }
}
const first = new Interval(2, 8), overlap = first.intersect(new Interval(6, 10));
console.log(JSON.stringify([overlap, first.intersect(new Interval(9, 12)), first.contains(4)]));
