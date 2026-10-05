const circle = Array.from({length: 7}, (_, i) => i + 1), removed = []; let index = 0;
while (circle.length > 1) {
  index = (index + 2) % circle.length;
  removed.push(circle.splice(index, 1)[0]);
}
let survivor = 0;
for (let size = 2; size <= 7; size++) survivor = (survivor + 3) % size;
if (circle[0] !== survivor + 1) throw new Error('recurrence agreement');
console.log(removed.join(',') + ':' + circle[0]);
