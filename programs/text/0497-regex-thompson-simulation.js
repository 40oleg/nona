const transitions = { 0: { a: [1] }, 1: { b: [2], c: [2] }, 2: { a: [1] } };
const epsilon = { 0: [2], 2: [3] };
function closure(states) {
  const expanded = new Set(states), queue = Array.from(states);
  for (let i = 0; i < queue.length; i++) for (const next of epsilon[queue[i]] || []) if (!expanded.has(next)) { expanded.add(next); queue.push(next); }
  return expanded;
}
function accepts(word) {
  let states = closure(new Set([0]));
  for (const c of word) {
    const next = new Set();
    for (const state of states) for (const target of (transitions[state] || {})[c] || []) next.add(target);
    states = closure(next);
  }
  return states.has(3);
}
console.log(JSON.stringify(['', 'ab', 'acab', 'a', 'abc'].map(accepts)));
