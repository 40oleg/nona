class Document {
  constructor(text) { this.text = text; this.version = 0; }
  edit(change) {
    const draft = { text: this.text };
    change(draft);
    if (!draft.text.trim()) return false;
    Object.assign(this, draft); this.version++;
    return true;
  }
}
const doc = new Document("start");
console.log(JSON.stringify([doc.edit(d => { d.text = ""; }), doc.edit(d => { d.text += "!"; }), doc]));
