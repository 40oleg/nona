class Heap {
  constructor() { this.items = []; }
  push(value) { const a = this.items; a.push(value); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p] <= a[i]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.items, top = a[0], last = a.pop(); if (!a.length) return top; a[0] = last; let i = 0; while (i * 2 + 1 < a.length) { let c = i * 2 + 1; if (c + 1 < a.length && a[c + 1] < a[c]) c++; if (a[i] <= a[c]) break; [a[i], a[c]] = [a[c], a[i]]; i = c; } return top; }
}
const queue = new Heap(); [5, 2, 8, 2, 1].forEach(v => queue.push(v));
const ordered = []; while (queue.items.length) ordered.push(queue.pop());
if (ordered.join(',') !== '1,2,2,5,8') throw new Error('heap order');
console.log(ordered.join(','));
