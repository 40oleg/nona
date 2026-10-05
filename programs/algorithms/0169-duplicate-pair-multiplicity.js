const values = [1, 1, 1, 3, 3, 3, 3, 2, 2].sort((a, b) => a - b), target = 4;
let left = 0, right = values.length - 1, pairs = 0;
while (left < right) {
  const sum = values[left] + values[right];
  if (sum < target) { left++; continue; } if (sum > target) { right--; continue; }
  if (values[left] === values[right]) { const count = right - left + 1; pairs += count * (count - 1) / 2; break; }
  const low = values[left], high = values[right]; let a = 0, b = 0;
  while (left <= right && values[left] === low) { a++; left++; }
  while (right >= left && values[right] === high) { b++; right--; }
  pairs += a * b;
}
console.log(pairs);
