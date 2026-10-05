const readings = [1, 3, 2, 5, 4, 4], width = 3, deque = [], maxima = [];
for (let i = 0; i < readings.length; i++) {
  while (deque.length && deque[0] <= i - width) deque.shift();
  while (deque.length && readings[deque[deque.length - 1]] <= readings[i]) deque.pop();
  deque.push(i);
  if (i + 1 >= width) maxima.push(readings[deque[0]]);
}
if (maxima.join(',') !== '3,5,5,5') throw new Error('window maximum');
console.log(maxima.join(','));
