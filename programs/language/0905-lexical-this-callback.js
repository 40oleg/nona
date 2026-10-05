class Scorer {
  constructor(multiplier) { this.multiplier = multiplier; this.total = 0; }
  score(...values) {
    return values.map(value => {
      const points = value*this.multiplier;
      this.total += points;
      return points;
    });
  }
}
const scorer = new Scorer(3);
console.log(JSON.stringify({points:scorer.score(2,4,1),total:scorer.total}));
