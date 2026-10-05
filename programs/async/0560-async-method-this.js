async function main() {
  class Counter {
    constructor(label) { this.label = label; this.total = 0; }
    async add(amount) {
      const value = await Promise.resolve(amount);
      this.total += value;
      return this.label + ':' + this.total;
    }
  }
  const counter = new Counter('meter');
  const receipts = await Promise.all([counter.add(3), counter.add(5)]);
  console.log(JSON.stringify([receipts, counter.total]));
}
main().catch(error => { throw error; });
