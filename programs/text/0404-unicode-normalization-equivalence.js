const input = ['é', 'e\u0301', '①', '1', 'ﬃ', 'ffi'];
const canonical = new Map(), compatible = new Map();
for (const word of input) {
  const nfc = word.normalize('NFC'), nfkc = word.normalize('NFKC');
  if (!canonical.has(nfc)) canonical.set(nfc, []);
  if (!compatible.has(nfkc)) compatible.set(nfkc, []);
  canonical.get(nfc).push(word);
  compatible.get(nfkc).push(word);
}
console.log(JSON.stringify({ canonical: Array.from(canonical), compatible: Array.from(compatible) }));
