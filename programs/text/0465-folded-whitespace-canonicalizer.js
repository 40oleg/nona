const source = '  alpha \t beta "two   words"\n gamma  ';
let quoted = false, pending = false, result = '';
for (const c of source) {
  if (c === '"') { if (pending && result) result += ' '; pending = false; quoted = !quoted; result += c; }
  else if (!quoted && /\s/.test(c)) {
    pending = true;
  }
  else { if (pending && result) result += ' '; pending = false; result += c; }
}
const quotedSpaces = result.includes('two   words');
console.log(JSON.stringify({ result, quotedSpaces }));
