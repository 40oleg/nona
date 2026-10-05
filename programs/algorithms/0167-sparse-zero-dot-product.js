const a = new Map([[2, 5], [7, -3], [100, 4]]), b = new Map([[1, 8], [7, 2], [100, 0]]);
function dot(left, right) {
  if (left.size > right.size) return dot(right, left);
  let sum = 0, overlap = 0;
  for (const [index, coefficient] of left) if (right.has(index)) { sum += coefficient * right.get(index); overlap++; }
  return [sum, overlap];
}
const result = dot(a, b), empty = dot(new Map(), a);
if (empty[0] !== 0 || result[0] !== -6) throw new Error('sparse identity');
console.log(result.join(':') + ',' + empty.join(':'));
