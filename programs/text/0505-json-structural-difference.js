const before = { a: 1, user: { name: 'Ada', age: 30 }, old: true };
const after = { a: 2, user: { name: 'Ada', age: 31 }, fresh: 'yes' };
const changes = [];
function compare(left, right, path) {
  if (left === right) return;
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      const next = path + '/' + key;
      if (!(key in left)) changes.push(['add', next, right[key]]);
      else if (!(key in right)) changes.push(['remove', next, left[key]]);
      else compare(left[key], right[key], next);
    }
  } else changes.push(['replace', path, left, right]);
}
compare(before, after, '');
console.log(JSON.stringify(changes));
