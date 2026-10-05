const source = 'HELLO WORLD';
let wheel = 3, encoded = '';
const shifts = [];
for (const c of source) {
  if (c === ' ') { encoded += c; continue; }
  const index = c.charCodeAt(0) - 65;
  encoded += String.fromCharCode(65 + (index + wheel) % 26);
  shifts.push(wheel);
  wheel = (wheel + index + 1) % 26;
}
console.log(JSON.stringify({ encoded, shifts }));
