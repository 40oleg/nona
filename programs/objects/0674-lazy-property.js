let evaluations = 0;
const report = { rows: [3, 8, 2] };
Object.defineProperty(report, "total", {
  configurable: true,
  get() {
    evaluations++;
    const result = this.rows.reduce((sum, n) => sum + n, 0);
    Object.defineProperty(this, "total", { value: result, enumerable: true });
    return result;
  }
});
console.log(JSON.stringify([report.total, report.total, evaluations, Object.keys(report)]));
