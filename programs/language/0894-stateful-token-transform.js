function* transform(tokens) {
  let quoted = false;
  for (const token of tokens) {
    if (token === '"') { quoted = !quoted; continue; }
    yield quoted ? token : token.toUpperCase();
  }
}
const tokens = ['hello','"','quiet','words','"','again'];
const [head,...tail] = [...transform(tokens)];
console.log(head);
console.log(JSON.stringify(tail));
