const env = {x:2}, trace = [];
function evalNode(node) {
  if (typeof node === 'number') return node;
  if (typeof node === 'string') return env[node];
  const [op,a,b,c] = node;
  if (op === 'bind') {
    const previous = env[a]; env[a] = evalNode(b);
    try { return evalNode(c); } finally { env[a] = previous; trace.push('restore:'+a); }
  }
  return evalNode(a)+evalNode(b);
}
console.log(evalNode(['add',['bind','x',8,'x'],'x']));
console.log(JSON.stringify({env,trace}));
