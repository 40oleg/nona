const words = 'a fox sees a bird and the fox follows another fox home'.split(' ');
const target = 'fox', radius = 2;
const concordance = [];
for (let i = 0; i < words.length; i++) {
  if (words[i] !== target) continue;
  const left = words.slice(Math.max(0, i - radius), i).join(' ');
  const right = words.slice(i + 1, i + radius + 1).join(' ');
  concordance.push({ position: i, left, match: target, right });
}
console.log(JSON.stringify(concordance));
