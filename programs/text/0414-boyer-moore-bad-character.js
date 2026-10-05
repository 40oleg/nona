const text = 'here is a simple example', pattern = 'example';
const last = new Map();
for (let i = 0; i < pattern.length; i++) last.set(pattern[i], i);
const matches = [];
let shift = 0, attempts = 0;
while (shift <= text.length - pattern.length) {
  attempts++;
  let j = pattern.length - 1;
  while (j >= 0 && pattern[j] === text[shift + j]) j--;
  if (j < 0) { matches.push(shift); shift++; }
  else shift += Math.max(1, j - (last.has(text[shift + j]) ? last.get(text[shift + j]) : -1));
}
console.log(JSON.stringify({ matches, attempts }));
