const rows = [['Name', 'Count'], ['apple', '3'], ['watermelon', '12'], ['pear', '7']];
const widths = rows[0].map((cell, column) => Math.max(...rows.map(row => row[column].length)));
const lines = [];
for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  lines.push(row[0].padEnd(widths[0]) + ' | ' + row[1].padStart(widths[1]));
  if (i === 0) {
    lines.push('-'.repeat(widths[0]) + '-+-' + '-'.repeat(widths[1]));
  }
}
console.log(lines.join('\n'));
