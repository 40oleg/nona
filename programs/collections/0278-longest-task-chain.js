const tasks = new Map([["a",[]],["b",["a"]],["c",["a"]],["d",["b","c"]],["e",["d"]]]);
const memo = new Map();
function length(task) {
  if (memo.has(task)) return memo.get(task);
  const prerequisites = tasks.get(task);
  const result = prerequisites.length ? 1+Math.max(...prerequisites.map(length)) : 1;
  memo.set(task,result);
  return result;
}
const ranked = Array.from(tasks.keys(),task=>[task,length(task)]);
console.log(JSON.stringify(ranked));
