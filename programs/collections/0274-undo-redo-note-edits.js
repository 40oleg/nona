let note = "";
const undo = [];
const redo = [];
const actions = [["add","a"],["add","b"],["undo"],["redo"],["add","c"],["undo"]];
for (const [action,text] of actions) {
  if (action==="add") { undo.push(note); note+=text; redo.length=0; }
  else if (action==="undo" && undo.length) { redo.push(note); note=undo.pop(); }
  else if (action==="redo" && redo.length) { undo.push(note); note=redo.pop(); }
}
const history = {note,undo,redo};
console.log(JSON.stringify(history));
