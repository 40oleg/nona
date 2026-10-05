const outgoing = new Map([['A', ['B', 'C']], ['B', ['A']], ['C', []]]);
const stack = ['A'], trail = []; let consumed = 0;
while (stack.length) {
  const node = stack[stack.length - 1], next = outgoing.get(node);
  if (next && next.length) { stack.push(next.pop()); consumed++; }
  else trail.push(stack.pop());
}
trail.reverse();
if (trail.length !== consumed + 1) throw new Error('edge accounting');
console.log(trail.join('>'));
