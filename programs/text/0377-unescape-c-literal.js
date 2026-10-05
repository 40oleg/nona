const source = 'A\\x42\\101\\nZ';
let result = '';
for (let i = 0; i < source.length; i++) {
  if (source[i] !== '\\') { result += source[i]; continue; }
  const c = source[++i];
  if (c === 'n') result += '\n';
  else if (c === 'x') { result += String.fromCharCode(parseInt(source.slice(i + 1, i + 3), 16)); i += 2; }
  else if (c >= '0' && c <= '7') {
    let digits = c;
    while (digits.length < 3 && source[i + 1] >= '0' && source[i + 1] <= '7') digits += source[++i];
    result += String.fromCharCode(parseInt(digits, 8));
  } else result += c;
}
console.log(JSON.stringify(result));
