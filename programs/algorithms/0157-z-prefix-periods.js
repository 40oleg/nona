const text = 'abcabcabc', z = new Int32Array(text.length); let left = 0, right = 0;
for (let i = 1; i < text.length; i++) {
  if (i < right) z[i] = Math.min(right - i, z[i - left]);
  while (i + z[i] < text.length && text[z[i]] === text[i + z[i]]) z[i]++;
  if (i + z[i] > right) { left = i; right = i + z[i]; }
}
const periods = [];
for (let i = 1; i < text.length; i++) if (i + z[i] === text.length && text.length % i === 0) periods.push(i);
if (periods[0] !== 3) throw new Error('primitive period');
console.log(periods.join(',') + ':' + Array.from(z).join(','));
