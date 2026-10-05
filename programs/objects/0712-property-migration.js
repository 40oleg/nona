const legacy = { full_name: "Ada Lane", active: 1, extra: "keep" };
const rename = { full_name: "name", active: "enabled" };
const modern = Object.fromEntries(Object.entries(legacy).map(([key, value]) => [
  rename[key] ?? key,
  key === "active" ? Boolean(value) : value
]));
Object.defineProperty(modern, "schema", { value: 2 });
console.log(JSON.stringify({
  modern,
  schema: modern.schema
}));
