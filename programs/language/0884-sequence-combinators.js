function* range(end) { for (let i = 0; i < end; i++) yield i; }
function* map(source, transform) {
  for (const value of source) yield transform(value);
}
function* filter(source, predicate) {
  for (const value of source) if (predicate(value)) yield value;
}
const values = filter(map(range(8),n => n*n),n => n%2 === 0);
const collected = [...values];
console.log(JSON.stringify(collected));
console.log(collected.reduce((a,b) => a+b,0));
