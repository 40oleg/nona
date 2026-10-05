const ciphertext = 'wkh txlfn eurzq ira';
const candidates = [];
for (let shift = 0; shift < 26; shift++) {
  let text = '', score = 0;
  for (const c of ciphertext) {
    const code = c.charCodeAt(0);
    const decoded = code >= 97 && code <= 122 ? String.fromCharCode(97 + (code - 97 - shift + 26) % 26) : c;
    text += decoded;
    if ('etaoin'.includes(decoded)) score++;
  }
  candidates.push({ shift, text, score });
}
candidates.sort((a, b) => b.score - a.score || a.shift - b.shift);
console.log(JSON.stringify(candidates.slice(0, 3)));
