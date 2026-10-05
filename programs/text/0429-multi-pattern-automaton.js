const nodes = [{ next: {}, fail: 0, output: [] }];
for (const word of ['he', 'she', 'his', 'hers']) {
  let state = 0;
  for (const c of word) { if (nodes[state].next[c] === undefined) { nodes[state].next[c] = nodes.length; nodes.push({ next: {}, fail: 0, output: [] }); } state = nodes[state].next[c]; }
  nodes[state].output.push(word);
}
const queue = Object.values(nodes[0].next);
for (let head = 0; head < queue.length; head++) {
  const parent = queue[head];
  for (const c of Object.keys(nodes[parent].next)) {
    const child = nodes[parent].next[c]; let fallback = nodes[parent].fail;
    while (fallback && nodes[fallback].next[c] === undefined) fallback = nodes[fallback].fail;
    nodes[child].fail = nodes[fallback].next[c] || 0;
    nodes[child].output = nodes[child].output.concat(nodes[nodes[child].fail].output); queue.push(child);
  }
}
const hits = []; let state = 0;
for (const c of 'ushers') { while (state && nodes[state].next[c] === undefined) state = nodes[state].fail; state = nodes[state].next[c] || 0; hits.push(...nodes[state].output); }
console.log(JSON.stringify(hits));
