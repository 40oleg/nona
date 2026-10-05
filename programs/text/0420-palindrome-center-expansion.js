const text = 'forgeeksskeegfor';
let best = '';
function expand(left, right) {
  while (left >= 0 && right < text.length && text[left] === text[right]) { left--; right++; }
  const found = text.slice(left + 1, right);
  if (found.length > best.length) best = found;
}
for (let i = 0; i < text.length; i++) { expand(i, i); expand(i, i + 1); }
const bounds = [text.indexOf(best), text.indexOf(best) + best.length];
console.log(JSON.stringify({ best, bounds }));
