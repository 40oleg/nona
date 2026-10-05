const bound = '250', target = 4, cache = new Map();
function count(index, sum, tight) {
  if (index === bound.length) return sum === target ? 1 : 0;
  const key = index + ':' + sum + ':' + tight;
  if (cache.has(key)) return cache.get(key);
  const limit = tight ? Number(bound[index]) : 9; let total = 0;
  for (let digit = 0; digit <= limit && sum + digit <= target; digit++) total += count(index + 1, sum + digit, tight && digit === limit);
  cache.set(key, total); return total;
}
console.log(count(0, 0, true));
