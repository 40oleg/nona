const pattern = 'C?R?';
const candidates = ['CART', 'CARE', 'CORE', 'CURB', 'CARD', 'CARS'];
const excludedAtLast = new Set(['S', 'D']);
const fits = candidates.filter(word => {
  if (word.length !== pattern.length) return false;
  for (let i = 0; i < pattern.length; i++) if (pattern[i] !== '?' && pattern[i] !== word[i]) return false;
  return !excludedAtLast.has(word[word.length - 1]);
});
const thirdLetters = Array.from(new Set(fits.map(word => word[2])));
console.log(JSON.stringify({ fits, thirdLetters }));
