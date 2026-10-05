const source = '"Doe, Jane" <jane@example.test>, Bob <bob@example.test>, solo@example.test';
const entries = [];
let quoted = false, current = '';
for (const c of source) {
  if (c === '"') quoted = !quoted;
  if (c === ',' && !quoted) { entries.push(current.trim()); current = ''; }
  else current += c;
}
entries.push(current.trim());
const mailboxes = entries.map(entry => { const at = entry.indexOf('<'); return at < 0 ? { name: '', address: entry } : { name: entry.slice(0, at).trim().replace(/^"|"$/g, ''), address: entry.slice(at + 1, -1) }; });
console.log(JSON.stringify(mailboxes));
