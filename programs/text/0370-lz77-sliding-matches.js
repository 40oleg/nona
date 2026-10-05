const text = 'abcabcabcXabc';
const tokens = [];
for (let position = 0; position < text.length;) {
  let bestLength = 0, bestDistance = 0;
  for (let distance = 1; distance <= Math.min(6, position); distance++) {
    let length = 0;
    while (length < 5 && position + length < text.length && text[position + length] === text[position + length - distance]) length++;
    if (length > bestLength) { bestLength = length; bestDistance = distance; }
  }
  if (bestLength >= 3) { tokens.push([bestDistance, bestLength]); position += bestLength; }
  else tokens.push(text[position++]);
}
console.log(JSON.stringify(tokens));
