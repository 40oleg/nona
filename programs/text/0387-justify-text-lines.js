const words = ['A', 'small', 'test', 'line'];
const width = 24;
const letters = words.reduce((sum, word) => sum + word.length, 0);
const gaps = words.length - 1;
const base = Math.floor((width - letters) / gaps);
const extra = (width - letters) % gaps;
let result = words[0];
for (let i = 0; i < gaps; i++) {
  result += ' '.repeat(base + (i < extra ? 1 : 0)) + words[i + 1];
}
console.log(JSON.stringify({ result, width: result.length }));
