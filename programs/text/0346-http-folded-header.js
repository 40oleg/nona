const lines = ['X-Note: first', ' second', 'Accept: text/plain', 'Accept: application/json'];
const unfolded = [];
for (const line of lines) {
  if (line[0] === ' ' && unfolded.length) unfolded[unfolded.length - 1] += ' ' + line.trim();
  else unfolded.push(line);
}
const headers = new Map();
for (const line of unfolded) {
  const at = line.indexOf(':');
  const key = line.slice(0, at).toLowerCase();
  headers.set(key, headers.has(key) ? headers.get(key) + ', ' + line.slice(at + 1).trim() : line.slice(at + 1).trim());
}
console.log(JSON.stringify(Array.from(headers)));
