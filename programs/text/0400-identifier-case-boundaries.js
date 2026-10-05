const source = 'parseHTTPResponse2XX';
const words = [];
let start = 0;
for (let i = 1; i < source.length; i++) {
  const previous = source[i - 1], current = source[i], next = source[i + 1] || '';
  const upper = current >= 'A' && current <= 'Z';
  const previousLower = previous >= 'a' && previous <= 'z';
  const nextLower = next >= 'a' && next <= 'z';
  if (upper && (previousLower || nextLower && previous >= 'A' && previous <= 'Z')) { words.push(source.slice(start, i)); start = i; }
}
words.push(source.slice(start));
console.log(JSON.stringify(words));
