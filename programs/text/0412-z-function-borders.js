const text = 'abcababcab';
const z = Array(text.length).fill(0);
let left = 0, right = 0;
for (let i = 1; i < text.length; i++) {
  if (i <= right) z[i] = Math.min(right - i + 1, z[i - left]);
  while (i + z[i] < text.length && text[z[i]] === text[i + z[i]]) z[i]++;
  if (i + z[i] - 1 > right) { left = i; right = i + z[i] - 1; }
}
const borders = [];
for (let i = 1; i < text.length; i++) if (i + z[i] === text.length) borders.push(z[i]);
console.log(JSON.stringify({ z, borders }));
