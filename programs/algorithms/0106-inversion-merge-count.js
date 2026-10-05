function count(values) {
  if (values.length < 2) return [values, 0];
  const mid = values.length >> 1, [left, a] = count(values.slice(0, mid)), [right, b] = count(values.slice(mid));
  let i = 0, j = 0, inversions = a + b; const merged = [];
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) merged.push(left[i++]); else { merged.push(right[j++]); inversions += left.length - i; }
  }
  return [[...merged, ...left.slice(i), ...right.slice(j)], inversions];
}
const [sorted, inversions] = count([3, 1, 2, 1]);
console.log(inversions + ':' + sorted.join(','));
