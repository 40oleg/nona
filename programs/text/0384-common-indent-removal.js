const text = '    alpha\n      beta\n\n    gamma';
const lines = text.split('\n');
const widths = lines.filter(line => line.trim()).map(line => {
  let count = 0;
  while (line[count] === ' ') count++;
  return count;
});
const common = Math.min(...widths);
const output = lines.map(line => line.slice(Math.min(common, line.length))).join('\n');
console.log(JSON.stringify({ common, output }));
