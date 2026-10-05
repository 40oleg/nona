const source = '{"a":[1,2],"ok":true,"n":null}';
let at = 0;
function read() {
  const c = source[at];
  if (c === '"') { at++; let text = ''; while (source[at] !== '"') text += source[at++]; at++; return text; }
  if (c === '[' || c === '{') {
    at++; const result = c === '[' ? [] : {};
    const close = c === '[' ? ']' : '}';
    while (source[at] !== close) {
      const value = read();
      if (c === '[') result.push(value); else { at++; result[value] = read(); }
      if (source[at] === ',') at++;
    }
    at++; return result;
  }
  const start = at;
  while (at < source.length && !',]}'.includes(source[at])) at++;
  const token = source.slice(start, at);
  return token === 'true' ? true : token === 'null' ? null : Number(token);
}
console.log(JSON.stringify(read()));
