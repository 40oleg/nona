const text = 'Dr. Ada said "Wait. Here?" Then left. Next!';
const abbreviations = new Set(['Dr', 'Mr', 'Ms']);
const sentences = [];
let quoted = false, start = 0;
for (let i = 0; i < text.length; i++) {
  if (text[i] === '"') quoted = !quoted;
  if (quoted || !'.!?'.includes(text[i])) continue;
  let begin = i - 1;
  while (begin >= 0 && /[A-Za-z]/.test(text[begin])) begin--;
  if (text[i] === '.' && abbreviations.has(text.slice(begin + 1, i))) continue;
  sentences.push(text.slice(start, i + 1).trim()); start = i + 1;
}
if (text.slice(start).trim()) sentences.push(text.slice(start).trim());
console.log(JSON.stringify(sentences));
