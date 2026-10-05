const heap = [];
for (const task of [{id:"a",p:4},{id:"b",p:1},{id:"c",p:3},{id:"d",p:2}]) {
  heap.push(task);
  let i=heap.length-1;
  while (i>0) {
    const parent=Math.floor((i-1)/2);
    if (heap[parent].p<=heap[i].p) break;
    [heap[parent],heap[i]]=[heap[i],heap[parent]];
    i=parent;
  }
}
const order = [];
while (heap.length) {
  order.push(heap[0].id);
  const last=heap.pop();
  if (!heap.length) break;
  heap[0]=last;
  let i=0;
  while (2*i+1<heap.length) {
    let child=2*i+1;
    if (child+1<heap.length&&heap[child+1].p<heap[child].p) child++;
    if (heap[i].p<=heap[child].p) break;
    [heap[i],heap[child]]=[heap[child],heap[i]];
    i=child;
  }
}
console.log(order.join(","));
