const grid = ['CAT', 'ORE', 'DOG'];
const dictionary = new Set(['CAT', 'CAR', 'COT', 'DOG', 'TORE']);
const prefixes = new Set();
for (const word of dictionary) for (let i = 1; i <= word.length; i++) prefixes.add(word.slice(0, i));
const found = new Set();
function search(row, col, word, used) {
  const key = row * 3 + col;
  if (row < 0 || row >= 3 || col < 0 || col >= 3 || used.has(key)) return;
  word += grid[row][col];
  if (!prefixes.has(word)) return;
  if (dictionary.has(word)) found.add(word);
  const next = new Set(used); next.add(key);
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) search(row + dr, col + dc, word, next);
}
for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) search(row, col, '', new Set());
console.log(JSON.stringify(Array.from(found).sort()));
