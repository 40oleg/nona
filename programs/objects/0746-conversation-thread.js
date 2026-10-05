class Message {
  constructor(id, text, parent = null) { Object.assign(this, { id, text, parent }); }
  path() { return this.parent ? [...this.parent.path(), this.id] : [this.id]; }
  quote() { return this.parent?.text.slice(0, 8) ?? "root"; }
}
const root = new Message(1, "Opening question");
const reply = new Message(2, "An answer", root);
const followup = new Message(3, "Thanks", reply);
console.log(JSON.stringify({
  path: followup.path(), quote: followup.quote(), rootQuote: root.quote()
}));
