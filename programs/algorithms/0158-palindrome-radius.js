const text = 'abacaba', radius = new Int32Array(text.length); let left = 0, right = -1;
for (let center = 0; center < text.length; center++) {
  let extent = center > right ? 1 : Math.min(radius[left + right - center], right - center + 1);
  while (center - extent >= 0 && center + extent < text.length && text[center - extent] === text[center + extent]) extent++;
  radius[center] = extent;
  if (center + extent - 1 > right) { left = center - extent + 1; right = center + extent - 1; }
}
const oddCount = radius.reduce((sum, n) => sum + n, 0);
console.log(oddCount + ':' + Array.from(radius).join(','));
