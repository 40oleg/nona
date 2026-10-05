const source = '\u001b[31mred\u001b[0m plain\u001b[2K';
let state = 'text', output = '';
const controls = [];
let control = '';
for (const c of source) {
  if (state === 'text') { if (c === '\u001b') { state = 'escape'; control = c; } else output += c; }
  else if (state === 'escape') { control += c; state = c === '[' ? 'csi' : 'text'; }
  else {
    control += c;
    if (c >= '@' && c <= '~') { controls.push(control); state = 'text'; }
  }
}
console.log(JSON.stringify({ output, removed: controls.length }));
