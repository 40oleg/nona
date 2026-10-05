const a = 'ABCBDAB', b = 'BDCABA';
const lengths = Array.from({length: a.length + 1}, () => Array(b.length + 1).fill(0));
for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) lengths[i][j] = a[i - 1] === b[j - 1] ? lengths[i - 1][j - 1] + 1 : Math.max(lengths[i - 1][j], lengths[i][j - 1]);
let i = a.length, j = b.length, answer = '';
while (i && j) {
  if (a[i - 1] === b[j - 1]) { answer = a[--i] + answer; j--; }
  else if (lengths[i - 1][j] >= lengths[i][j - 1]) i--; else j--;
}
console.log(answer.length + ':' + answer);
