const stream = '5:hello,3:a,b,0:,';
const values = [];
let cursor = 0;
while (cursor < stream.length) {
  const colon = stream.indexOf(':', cursor);
  const size = Number(stream.slice(cursor, colon));
  const start = colon + 1;
  if (stream[start + size] !== ',') throw new Error('missing terminator');
  values.push(stream.slice(start, start + size));
  cursor = start + size + 1;
}
console.log(JSON.stringify(values));
