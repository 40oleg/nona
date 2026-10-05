class Editor {
  constructor(text) { this.text = text; this.undo = []; }
  apply([op,at,value]) {
    this.undo.push(this.text);
    if (op === 'insert') this.text = this.text.slice(0,at) + value + this.text.slice(at);
    else this.text = this.text.slice(0,at) + this.text.slice(at+value);
  }
  revert() { this.text = this.undo.pop() ?? this.text; }
}
const editor = new Editor('cat');
for (const command of [['insert',0,'big '],['delete',4,1]]) editor.apply(command);
editor.revert();
console.log(JSON.stringify({text:editor.text,snapshots:[...editor.undo]}));
