const text = 'cbaebabacd', pattern = 'abc';
const balance = new Map();
for (const c of pattern) balance.set(c, (balance.get(c) || 0) + 1);
const matches = [];
for (let i = 0; i < text.length; i++) {
  const incoming = text[i]; balance.set(incoming, (balance.get(incoming) || 0) - 1);
  if (i >= pattern.length) { const outgoing = text[i - pattern.length]; balance.set(outgoing, (balance.get(outgoing) || 0) + 1); }
  if (i + 1 >= pattern.length && Array.from(balance.values()).every(n => n === 0)) matches.push(i - pattern.length + 1);
}
console.log(JSON.stringify(matches));
