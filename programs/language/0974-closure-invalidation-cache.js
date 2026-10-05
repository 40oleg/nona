function prices(catalog) {
  const cache = {}; let reads = 0;
  return {
    get(id) { if (cache[id] === undefined) { reads++; cache[id] = catalog[id]?.price ?? 0; } return cache[id]; },
    update(id,price) { catalog[id] = {price}; delete cache[id]; },
    stats() { return reads; }
  };
}
const service = prices({a:{price:4}});
const values = [service.get('a'),service.get('a')]; service.update('a',7); values.push(service.get('a'),service.get('b'));
console.log(JSON.stringify({values,reads:service.stats()}));
