function fibonacci() {
  const cache = {0:0,1:1}; let misses = 0;
  function value(n) {
    if (cache[n] !== undefined) return cache[n];
    misses++; cache[n] = value(n-1)+value(n-2); return cache[n];
  }
  return {value,stats:() => ({misses,entries:Object.keys(cache).length})};
}
const {value,stats} = fibonacci();
console.log(JSON.stringify([value(10),value(8)]));
console.log(JSON.stringify(stats()));
