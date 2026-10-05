class Inbox {
  #seen = new Set();
  #messages = [];
  receive(message) {
    if (this.#seen.has(message.id)) return false;
    this.#seen.add(message.id); this.#messages.push(message.text); return true;
  }
  get contents() { return this.#messages.slice(); }
}
const inbox = new Inbox();
const results = [{ id: 1, text: "one" }, { id: 1, text: "duplicate" }, { id: 2, text: "two" }].map(m => inbox.receive(m));
console.log(JSON.stringify([results, inbox.contents]));
