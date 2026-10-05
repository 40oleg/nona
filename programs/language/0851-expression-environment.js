function evaluate(node, env = {}) {
  if (typeof node === 'number') return node;
  if (typeof node === 'string') return env[node] ?? 0;
  const [op,a,b,c] = node;
  if (op === 'let') return evaluate(c,{...env,[a]:evaluate(b,env)});
  const left = evaluate(a,env), right = evaluate(b,env);
  return op === '+' ? left+right : left*right;
}
const expression = ['let','x',3,['+',['let','x',8,['*','x',2]],'x']];
console.log(evaluate(expression));
console.log(evaluate(['+','x',2],{x:10}));
