function* numbers() { for (let i = 1; i <= 5; i++) yield i; }
function* windows(source, size) {
  const buffer = [];
  for (const value of source) {
    buffer.push(value);
    if (buffer.length > size) buffer.shift();
    if (buffer.length === size) yield [...buffer];
  }
}
const output = [...windows(numbers(),3)];
const [first,...remaining] = output;
console.log(JSON.stringify({first,remaining}));
