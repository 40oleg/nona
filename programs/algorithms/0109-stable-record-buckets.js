const records = [['a', 2], ['b', 0], ['c', 2], ['d', 1], ['e', 0]];
const buckets = Array.from({length: 3}, () => []);
for (const record of records) { const [name, priority] = record; buckets[priority].push(name); }
const ordered = buckets.flatMap(bucket => bucket);
if (ordered.indexOf('a') > ordered.indexOf('c')) throw new Error('stability');
console.log(ordered.join(','));
