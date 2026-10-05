class Door {
  #locked = true;
  #open = false;
  constructor(key) { this.key = key; }
  unlock(key) { if (key !== this.key) return false; this.#locked = false; return true; }
  open() { if (this.#locked) return false; this.#open = true; return true; }
  lock() { if (this.#open) return false; this.#locked = true; return true; }
  close() { this.#open = false; }
  toJSON() { return { locked: this.#locked, open: this.#open }; }
}
const door = new Door("brass"); const results = [door.open(), door.unlock("brass"), door.open(), door.lock()];
door.close(); results.push(door.lock());
console.log(JSON.stringify([results, door]));
