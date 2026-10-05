const wire = '4\r\nWiki\r\n5\r\npedia\r\n0\r\n\r\n';
let cursor = 0;
const chunks = [];
while (cursor < wire.length) {
  const end = wire.indexOf('\r\n', cursor);
  const size = parseInt(wire.slice(cursor, end), 16);
  cursor = end + 2;
  if (size === 0) break;
  chunks.push(wire.slice(cursor, cursor + size));
  cursor += size + 2;
}
console.log(JSON.stringify({ chunks, body: chunks.join(''), consumed: cursor }));
