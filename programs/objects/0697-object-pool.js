class Pool {
  #free = [];
  #created = 0;
  acquire() { return this.#free.pop() ?? { id: ++this.#created, busy: true }; }
  release(item) { item.busy = false; this.#free.push(item); }
  get created() { return this.#created; }
}
const pool = new Pool();
const first = pool.acquire();
pool.release(first);
const second = pool.acquire();
console.log(JSON.stringify([first === second, second.id, pool.created]));
