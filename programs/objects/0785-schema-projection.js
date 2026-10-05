class Schema {
  constructor(fields) { this.fields = fields; }
  project(record) {
    return Object.fromEntries(Object.entries(this.fields).map(([key, fallback]) => [key, record[key] ?? fallback]));
  }
  missing(record) { return Object.keys(this.fields).filter(key => !Object.hasOwn(record, key)); }
}
const schema = new Schema({ name: "unknown", age: 0, active: false });
const raw = { name: "Ada", active: true, secret: "omit" };
console.log(JSON.stringify([schema.project(raw), schema.missing(raw)]));
