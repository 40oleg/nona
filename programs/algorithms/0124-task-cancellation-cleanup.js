const closed = [];
function* task(name, steps) {
  try { for (let i = 1; i <= steps; i++) yield name + i; }
  finally { closed.push(name); }
}
const a = task('A', 3), b = task('B', 2), output = [];
output.push(a.next().value, b.next().value); a.return('cancelled');
for (const step of b) output.push(step);
if (closed.join(',') !== 'A,B') throw new Error('cleanup');
console.log(output.join(',') + ':' + closed.join(','));
