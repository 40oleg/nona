class Editor {
  constructor() { this.text = ""; this.undoStack = []; }
  append(fragment) { this.undoStack.push(this.text); this.text += fragment; }
  undo() { if (this.undoStack.length) this.text = this.undoStack.pop(); }
  get snapshot() { return { text: this.text, depth: this.undoStack.length }; }
}
const editor = new Editor();
editor.append("one");
editor.append(" two");
editor.undo();
console.log(JSON.stringify(editor.snapshot));
