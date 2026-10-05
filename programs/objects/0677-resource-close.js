class BufferLease {
  #closed = false;
  constructor(data) { this.data = data; }
  read() { if (this.#closed) throw new Error("closed"); return this.data.join(":"); }
  close() { this.#closed = true; this.data.length = 0; }
}
const lease = new BufferLease([1, 2, 3]);
const log = [];
try { log.push(lease.read()); } finally { lease.close(); }
try { lease.read(); } catch (error) { log.push(error.message); }
console.log(JSON.stringify(log));
