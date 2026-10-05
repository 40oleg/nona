function relative(from, to) {
  const a = from.split('/').filter(Boolean), b = to.split('/').filter(Boolean);
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common++;
  const up = Array(a.length - common).fill('..');
  const down = b.slice(common);
  return up.concat(down).join('/') || '.';
}
const pairs = [['/a/b/c', '/a/d/e'], ['/same', '/same'], ['/x', '/x/y']];
console.log(JSON.stringify(pairs.map(([a, b]) => relative(a, b))));
