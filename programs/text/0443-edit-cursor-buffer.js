const commands = [['type', 'abcd'], ['left', 2], ['type', 'XY'], ['delete', 1], ['backspace', 1], ['right', 1]];
const buffer = [];
let cursor = 0;
for (const [action, value] of commands) {
  switch (action) {
    case 'type': buffer.splice(cursor, 0, ...value); cursor += value.length; break;
    case 'left': cursor = Math.max(0, cursor - value); break;
    case 'right': cursor = Math.min(buffer.length, cursor + value); break;
    case 'delete': buffer.splice(cursor, value); break;
    case 'backspace': { const count = Math.min(cursor, value); buffer.splice(cursor - count, count); cursor -= count; break; }
  }
}
console.log(JSON.stringify({ text: buffer.join(''), cursor }));
