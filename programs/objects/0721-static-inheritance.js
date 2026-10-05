class Sequence {
  static start = 5;
  static values(count) { return Array.from({ length: count }, (_, i) => this.start + i); }
}
class OddSequence extends Sequence {
  static start = 1;
  static values(count) { return super.values(count).map(n => n * 2 - 1); }
}
console.log(JSON.stringify([
  Sequence.values(3), OddSequence.values(4), Object.hasOwn(OddSequence, "start")
]));
