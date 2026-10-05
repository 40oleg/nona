function* values(items) { for (const item of items) yield item; }
const iterators = [values([]), values([1, 4]), values([]), values([2, 3])];
const heads = iterators.map((iterator, index) => ({index, step: iterator.next()})), output = [];
while (heads.some(head => !head.step.done)) {
  let best = null;
  for (const head of heads) if (!head.step.done && (!best || head.step.value < best.step.value)) best = head;
  output.push(best.step.value); best.step = iterators[best.index].next();
}
if (output.join(',') !== '1,2,3,4') throw new Error('merge');
console.log(output.join(','));
