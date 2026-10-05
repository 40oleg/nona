class Gradebook {
  constructor(weights) { this.weights = weights; this.scores = new Map(); }
  record(student, scores) { this.scores.set(student, scores); }
  average(student) { const scores = this.scores.get(student); return Object.entries(this.weights).reduce((sum, [subject, weight]) => sum + scores[subject] * weight, 0); }
  ranking() { return [...this.scores.keys()].map(name => ({ name, score: this.average(name) })).sort((a, b) => b.score - a.score); }
}
const book = new Gradebook({ quiz: 0.25, exam: 0.75 });
book.record("A", { quiz: 80, exam: 92 }); book.record("B", { quiz: 100, exam: 80 });
console.log(JSON.stringify(book.ranking()));
