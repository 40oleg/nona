const actions = ['+a', '+b', '+c', 'undo', 'undo', 'redo', '+X', 'redo'];
const undo = [''], redo = [];
for (const action of actions) {
  if (action === 'undo') { if (undo.length > 1) redo.push(undo.pop()); }
  else if (action === 'redo') { if (redo.length) undo.push(redo.pop()); }
  else {
    undo.push(undo[undo.length - 1] + action.slice(1));
    redo.length = 0;
  }
}
const current = undo[undo.length - 1];
console.log(JSON.stringify({ current, history: undo, redo }));
