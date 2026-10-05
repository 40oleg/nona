class TagSet {
  #tags = new Set();
  #normalize(value) { return value.trim().toLowerCase(); }
  add(value) { this.#tags.add(this.#normalize(value)); return this; }
  has(value) { return this.#tags.has(this.#normalize(value)); }
  toJSON() { return [...this.#tags].sort(); }
}
const tags = new TagSet().add(" Blue ").add("blue").add("RED");
console.log(JSON.stringify([
  tags, tags.has(" red "), tags.has("green")
]));
