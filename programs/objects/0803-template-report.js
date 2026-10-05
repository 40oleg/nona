class Report {
  render(items) { return this.header() + ":" + items.map(item => this.format(item)).join(this.separator()); }
  header() { return "report"; }
  separator() { return ","; }
}
class ScoreReport extends Report {
  header() { return "scores"; }
  format(item) { return item.name + "=" + item.score; }
  separator() { return ";"; }
}
console.log(new ScoreReport().render([{ name: "A", score: 7 }, { name: "B", score: 9 }]));
