class LRU {
  #items = new Map();
  constructor(limit) { this.limit = limit; }
  get(key) { if (!this.#items.has(key)) return null; const value = this.#items.get(key); this.#items.delete(key); this.#items.set(key, value); return value; }
  put(key, value) { this.#items.delete(key); this.#items.set(key, value); if (this.#items.size > this.limit) this.#items.delete(this.#items.keys().next().value); }
  toJSON() { return [...this.#items]; }
}
const cache = new LRU(2); cache.put("a", 1); cache.put("b", 2); cache.get("a"); cache.put("c", 3);
console.log(JSON.stringify([cache.get("b"), cache]));
