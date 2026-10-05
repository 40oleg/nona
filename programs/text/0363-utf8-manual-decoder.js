const bytes = [65, 206, 169, 240, 159, 152, 128];
let output = '';
for (let i = 0; i < bytes.length;) {
  const first = bytes[i++];
  const count = first < 128 ? 0 : first < 224 ? 1 : first < 240 ? 2 : 3;
  let cp = first & (count === 0 ? 127 : count === 1 ? 31 : count === 2 ? 15 : 7);
  for (let j = 0; j < count; j++) cp = (cp << 6) | (bytes[i++] & 63);
  output += String.fromCodePoint(cp);
}
console.log(output);
