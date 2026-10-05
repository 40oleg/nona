class ResourceStack {
  #cleanup = [];
  #closed = false;
  use(resource) { if (this.#closed) throw new Error("closed stack"); this.#cleanup.push(() => resource.close()); return resource; }
  close() { if (this.#closed) return; this.#closed = true; while (this.#cleanup.length) this.#cleanup.pop()(); }
}
const log = [], stack = new ResourceStack();
try {
  stack.use({ close() { log.push("first"); } });
  stack.use({ close() { log.push("second"); } });
  log.push("work");
} finally { stack.close(); }
stack.close();
console.log(JSON.stringify(log));
