class Upload {
  #chunks = new Map();
  constructor(count) { this.count = count; }
  receive(index, text) { if (index < 0 || index >= this.count) return false; this.#chunks.set(index, text); return true; }
  get complete() { return this.#chunks.size === this.count; }
  assemble() { return this.complete ? Array.from({ length: this.count }, (_, i) => this.#chunks.get(i)).join("") : "incomplete"; }
}
const upload = new Upload(3); upload.receive(2, "C"); upload.receive(0, "A");
const first = upload.assemble(); upload.receive(1, "B");
console.log(JSON.stringify([first, upload.complete, upload.assemble()]));
