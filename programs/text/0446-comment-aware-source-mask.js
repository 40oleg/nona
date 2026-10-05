const source = 'x="//keep"; /* hide */ y=2; // tail\nz=3';
let state = 'code', quote = '', output = '';
for (let i = 0; i < source.length; i++) {
  const c = source[i], next = source[i + 1];
  if (state === 'string') { output += c; if (c === '\\') output += source[++i]; else if (c === quote) state = 'code'; }
  else if (state === 'line') { output += c === '\n' ? '\n' : ' '; if (c === '\n') state = 'code'; }
  else if (state === 'block') { if (c === '*' && next === '/') { output += '  '; i++; state = 'code'; } else output += c === '\n' ? '\n' : ' '; }
  else if (c === '"' || c === "'") { state = 'string'; quote = c; output += c; }
  else if (c === '/' && (next === '/' || next === '*')) { state = next === '/' ? 'line' : 'block'; output += '  '; i++; }
  else output += c;
}
console.log(output);
