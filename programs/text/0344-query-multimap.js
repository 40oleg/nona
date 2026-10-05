const query = 'tag=red&tag=blue&empty=&flag&name=A%20B';
const pairs = new Map();
for (const part of query.split('&')) {
  const at = part.indexOf('=');
  const key = decodeURIComponent(at < 0 ? part : part.slice(0, at));
  const value = decodeURIComponent(at < 0 ? '' : part.slice(at + 1));
  if (!pairs.has(key)) pairs.set(key, []);
  pairs.get(key).push(value);
}
const result = [];
for (const [key, values] of pairs) result.push([key, values]);
console.log(JSON.stringify(result));
