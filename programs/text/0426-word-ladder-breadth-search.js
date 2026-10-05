const dictionary = new Set(['hot', 'dot', 'dog', 'lot', 'log', 'cog']);
const queue = [['hit']];
let answer = [];
for (let head = 0; head < queue.length; head++) {
  const path = queue[head], last = path[path.length - 1];
  if (last === 'cog') { answer = path; break; }
  for (const word of Array.from(dictionary)) {
    let differences = 0;
    for (let i = 0; i < word.length; i++) if (word[i] !== last[i]) differences++;
    if (differences === 1) { dictionary.delete(word); queue.push(path.concat(word)); }
  }
}
console.log(JSON.stringify(answer));
