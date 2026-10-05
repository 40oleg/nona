const text = 'abcabcbbxyz';
const last = new Map();
let start = 0, bestStart = 0, bestLength = 0;
for (let i = 0; i < text.length; i++) {
  if (last.has(text[i])) start = Math.max(start, last.get(text[i]) + 1);
  last.set(text[i], i);
  if (i - start + 1 > bestLength) { bestStart = start; bestLength = i - start + 1; }
}
const longest = text.slice(bestStart, bestStart + bestLength);
console.log(JSON.stringify({ longest, bestStart, bestLength }));
