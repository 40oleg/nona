const rack = 'AELP?';
const dictionary = ['APPLE', 'PEAL', 'LEAP', 'PALE', 'PEAR', 'BELL'];
const available = {};
for (const tile of rack) available[tile] = (available[tile] || 0) + 1;
const valid = [];
for (const word of dictionary) {
  const counts = { ...available };
  let possible = true;
  for (const c of word) {
    if (counts[c]) counts[c]--;
    else if (counts['?']) counts['?']--;
    else { possible = false; break; }
  }
  if (possible) valid.push(word);
}
console.log(JSON.stringify(valid));
