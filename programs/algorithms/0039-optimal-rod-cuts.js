const prices = [0, 2, 5, 7, 8, 10], length = 5;
const revenue = Array(length + 1).fill(0), first = Array(length + 1).fill(0);
for (let n = 1; n <= length; n++) {
  for (let cut = 1; cut <= n; cut++) if (prices[cut] + revenue[n - cut] > revenue[n]) { revenue[n] = prices[cut] + revenue[n - cut]; first[n] = cut; }
}
const cuts = []; let remaining = length;
while (remaining) { cuts.push(first[remaining]); remaining -= first[remaining]; }
if (cuts.reduce((a, b) => a + b, 0) !== length) throw new Error('material');
console.log(revenue[length] + ':' + cuts.join('+'));
