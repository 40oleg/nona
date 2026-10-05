const word = 'banana';
const patterns = ['ba1', 'a2n', 'na3', 'an4a', 'n5a'];
const padded = '.' + word + '.';
const weights = Array(padded.length + 1).fill(0);
for (const pattern of patterns) {
  let letters = '';
  const values = [0];
  for (const character of pattern) {
    if (character >= '0' && character <= '9') values[values.length - 1] = Number(character);
    else { letters += character; values.push(0); }
  }
  for (let at = padded.indexOf(letters); at >= 0; at = padded.indexOf(letters, at + 1)) {
    for (let boundary = 0; boundary < values.length; boundary++) weights[at + boundary] = Math.max(weights[at + boundary], values[boundary]);
  }
}
const parts = [];
let start = 0;
for (let boundary = 2; boundary <= word.length - 2; boundary++) {
  if (weights[boundary + 1] % 2) { parts.push(word.slice(start, boundary)); start = boundary; }
}
parts.push(word.slice(start));
console.log(JSON.stringify({ weights, hyphenated: parts.join('-') }));
