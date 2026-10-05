const messages = { zero: 'No files', one: '{n} file', other: '{n} files' };
function render(count) {
  const category = count === 0 ? 'zero' : count === 1 ? 'one' : 'other';
  return messages[category].replace('{n}', String(count));
}
const results = [];
for (const count of [0, 1, 2, 12]) {
  results.push({ count, text: render(count) });
}
console.log(JSON.stringify(results));
