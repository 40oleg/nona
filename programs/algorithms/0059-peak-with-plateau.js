const heights = [1, 3, 6, 6, 6, 4, 2]; let lo = 0, hi = heights.length - 1;
while (lo < hi) {
  const mid = Math.floor((lo + hi) / 2);
  if (heights[mid] < heights[mid + 1]) lo = mid + 1; else hi = mid;
}
let left = lo, right = lo;
while (left > 0 && heights[left - 1] === heights[lo]) left--;
while (right + 1 < heights.length && heights[right + 1] === heights[lo]) right++;
console.log(JSON.stringify([heights[lo], left, right]));
