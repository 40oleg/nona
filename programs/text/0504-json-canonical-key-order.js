function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const pairs = [];
  for (const key of Object.keys(value).sort()) pairs.push(JSON.stringify(key) + ':' + canonical(value[key]));
  return '{' + pairs.join(',') + '}';
}
const value = { z: 1, a: { y: 2, b: 3 }, list: [{ d: 4, c: 5 }, true] };
const text = canonical(value);
console.log(text);
