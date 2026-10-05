const push = (tail, value) => ({value, tail, size: (tail ? tail.size : 0) + 1});
const base = push(push(null, 'root'), 'shared');
const left = push(base, 'left'), right = push(base, 'right');
function values(head) { const result = []; while (head) { result.push(head.value); head = head.tail; } return result.join('/'); }
if (left.tail !== right.tail || base.size !== 2) throw new Error('sharing');
console.log(values(left) + '|' + values(right) + '|' + values(base));
