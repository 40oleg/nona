const data = [0, 65, 66, 255, 32, 126, 10, 67, 68];
const lines = [];
for (let start = 0; start < data.length; start += 4) {
  const row = data.slice(start, start + 4);
  const hex = row.map(byte => byte.toString(16).padStart(2, '0')).join(' ').padEnd(11, ' ');
  const ascii = row.map(byte => byte >= 32 && byte < 127 ? String.fromCharCode(byte) : '.').join('');
  const offset = start.toString(16).padStart(4, '0');
  lines.push(offset + '  ' + hex + '  ' + ascii);
}
console.log(lines.join('\n'));
