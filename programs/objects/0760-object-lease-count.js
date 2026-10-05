class SharedResource {
  #references = 0;
  #disposed = false;
  acquire() {
    if (this.#disposed) throw new Error("disposed");
    this.#references++; let released = false;
    return () => { if (!released) { released = true; if (--this.#references === 0) this.#disposed = true; } };
  }
  get state() { return [this.#references, this.#disposed]; }
}
const resource = new SharedResource(); const a = resource.acquire(), b = resource.acquire();
a(); a(); const middle = resource.state; b();
console.log(JSON.stringify([middle, resource.state]));
