const first = { name: "first" };
const second = { name: "second", next: first };
first.next = second;
const seen = new WeakSet();
const text = JSON.stringify(first, function (key, value) {
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[cycle]";
    seen.add(value);
  }
  return value;
});
console.log(text);
