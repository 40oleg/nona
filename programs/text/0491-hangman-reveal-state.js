const secret = 'BANANA';
const guesses = ['A', 'X', 'N', 'A', 'B'];
const seen = new Set(), misses = [];
const visible = Array(secret.length).fill('_');
for (const guess of guesses) {
  if (seen.has(guess)) continue;
  seen.add(guess);
  let hit = false;
  for (let i = 0; i < secret.length; i++) if (secret[i] === guess) { visible[i] = guess; hit = true; }
  if (!hit) misses.push(guess);
}
console.log(JSON.stringify({ word: visible.join(''), misses, won: !visible.includes('_') }));
