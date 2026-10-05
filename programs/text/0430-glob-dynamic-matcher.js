function matches(text, pattern) {
  let previous = Array(text.length + 1).fill(false); previous[0] = true;
  for (const token of pattern) {
    const row = Array(text.length + 1).fill(false);
    if (token === '*') row[0] = previous[0];
    for (let i = 1; i <= text.length; i++) row[i] = token === '*' ? previous[i] || row[i - 1] : previous[i - 1] && (token === '?' || token === text[i - 1]);
    previous = row;
  }
  return previous[text.length];
}
console.log(JSON.stringify(['report.txt', 'rep.txt', 'report.csv'].map(text => matches(text, 'rep*.t?t'))));
