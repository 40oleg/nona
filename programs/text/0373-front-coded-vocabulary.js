const vocabulary = ['carpet', 'car', 'cart', 'carbon', 'dog'].sort();
const records = [];
let previous = '';
for (const word of vocabulary) {
  let common = 0;
  while (common < previous.length && common < word.length && previous[common] === word[common]) common++;
  records.push([common, word.slice(common)]);
  previous = word;
}
let restored = '';
console.log(JSON.stringify(records.map(([common, suffix]) => { restored = restored.slice(0, common) + suffix; return restored; })));
