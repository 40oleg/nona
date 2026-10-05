const input = 'alpha\\tomega\tbeta\\nline\tend';
function decode(cell) {
  let result = '';
  for (let i = 0; i < cell.length; i++) {
    if (cell[i] !== '\\') { result += cell[i]; continue; }
    switch (cell[++i]) {
      case 't': result += '\t'; break;
      case 'n': result += '\n'; break;
      default: result += cell[i];
    }
  }
  return result;
}
console.log(JSON.stringify(input.split('\t').map(decode)));
