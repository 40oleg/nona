class Snapshot {
  constructor(record) { this.record = { ...record }; }
  diff(next) {
    const keys = new Set([...Object.keys(this.record), ...Object.keys(next)]);
    return [...keys].filter(key => !Object.is(this.record[key], next[key])).map(key => ({ key, before: this.record[key] ?? null, after: next[key] ?? null }));
  }
}
const snapshot = new Snapshot({ count: 2, title: "draft", obsolete: true });
const changes = snapshot.diff({ count: 3, title: "draft", newField: "yes" });
console.log(JSON.stringify(changes));
