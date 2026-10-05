class Cache {
  constructor(limit) { this.limit = limit; this.entries = new Map(); }
  get(key) { if (!this.entries.has(key)) return 'miss'; const value = this.entries.get(key); this.entries.delete(key); this.entries.set(key, value); return value; }
  put(key, value) { this.entries.delete(key); this.entries.set(key, value); if (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value); }
}
const pages = new Cache(2); pages.put('a', 1); pages.put('b', 2);
const touch = pages.get('a'); pages.put('c', 3);
if (pages.get('b') !== 'miss') throw new Error('least recent');
console.log(touch + ':' + JSON.stringify([...pages.entries]));
