class Repository {
  #records = new Map();
  insert(record) { if (this.#records.has(record.id)) return false; this.#records.set(record.id, Object.freeze({ ...record })); return true; }
  update(id, patch) { const record = this.#records.get(id); if (!record) return false; this.#records.set(id, Object.freeze({ ...record, ...patch, id })); return true; }
  query(predicate) { return [...this.#records.values()].filter(predicate); }
}
const repository = new Repository(); repository.insert({ id: 1, score: 3 }); repository.insert({ id: 2, score: 8 });
const duplicate = repository.insert({ id: 1, score: 99 }); repository.update(1, { score: 9, id: 5 });
console.log(JSON.stringify([duplicate, repository.query(record => record.score >= 8)]));
