const lines = ['one', 'two', 'three', 'four'];
const hunks = [{ at: 1, remove: ['two'], add: ['TWO', 'extra'] }, { at: 3, remove: ['four'], add: [] }];
const output = [];
let cursor = 0;
for (const hunk of hunks) {
  output.push(...lines.slice(cursor, hunk.at));
  const actual = lines.slice(hunk.at, hunk.at + hunk.remove.length);
  if (actual.join('\n') !== hunk.remove.join('\n')) throw new Error('context mismatch');
  output.push(...hunk.add);
  cursor = hunk.at + hunk.remove.length;
}
output.push(...lines.slice(cursor));
console.log(JSON.stringify(output));
