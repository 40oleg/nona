const cache = new Map();
const evicted = [];
for (const key of ["a","b","a","c","d","c"]) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key,key.toUpperCase());
  if (cache.size>2) {
    const oldest = cache.keys().next().value;
    evicted.push(oldest);
    cache.delete(oldest);
  }
}
console.log(JSON.stringify({keys:Array.from(cache.keys()),evicted}));
