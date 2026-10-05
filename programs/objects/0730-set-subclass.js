class UniqueWords extends Set {
  add(word) { return super.add(word.toLowerCase().replace(/[.!]/g, "")); }
  intersection(other) { return [...this].filter(word => other.has(word)); }
  toJSON() { return [...this].sort(); }
}
const words = new UniqueWords(["Hello!", "HELLO", "World."]);
const other = new UniqueWords(["world", "moon"]);
console.log(JSON.stringify({
  words,
  overlap: words.intersection(other)
}));
