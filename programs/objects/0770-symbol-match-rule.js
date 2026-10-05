class PrefixRule {
  constructor(prefix) { this.prefix = prefix; }
  [Symbol.match](text) { return text.startsWith(this.prefix) ? [this.prefix, text.slice(this.prefix.length)] : null; }
  [Symbol.search](text) { return text.indexOf(this.prefix); }
}
const rule = new PrefixRule("ID:");
console.log(JSON.stringify({
  valid: "ID:42".match(rule),
  invalid: "42".match(rule),
  location: "x ID:7".search(rule)
}));
