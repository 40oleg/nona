const pattern = 'aba', text = 'abababa', failure = new Int32Array(pattern.length);
for (let i = 1, matched = 0; i < pattern.length; i++) {
  while (matched && pattern[i] !== pattern[matched]) matched = failure[matched - 1];
  if (pattern[i] === pattern[matched]) matched++;
  failure[i] = matched;
}
let matched = 0; const positions = [];
for (let i = 0; i < text.length; i++) {
  while (matched && text[i] !== pattern[matched]) matched = failure[matched - 1];
  if (text[i] === pattern[matched]) matched++;
  if (matched === pattern.length) { positions.push(i - pattern.length + 1); matched = failure[matched - 1]; }
}
console.log(positions.join(','));
