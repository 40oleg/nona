const text = 'banana$';
const rotations = [];
for (let i = 0; i < text.length; i++) {
  rotations.push(text.slice(i) + text.slice(0, i));
}
rotations.sort();
const last = rotations.map(row => row[row.length - 1]).join('');
const primary = rotations.indexOf(text);
let table = Array(text.length).fill('');
for (let round = 0; round < text.length; round++) table = table.map((row, i) => last[i] + row).sort();
console.log(JSON.stringify({ last, primary, recovered: table[primary] }));
