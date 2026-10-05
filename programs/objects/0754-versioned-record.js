class Record {
  #value;
  #version = 0;
  constructor(value) { this.#value = value; }
  read() { return { value: this.#value, version: this.#version }; }
  compareAndSet(version, value) { if (version !== this.#version) return false; this.#value = value; this.#version++; return true; }
}
const record = new Record("draft");
const snapshot = record.read();
console.log(JSON.stringify([record.compareAndSet(snapshot.version, "published"), record.compareAndSet(snapshot.version, "stale"), record.read()]));
