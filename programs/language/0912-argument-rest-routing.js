const handlers = {
  join:(separator,...words) => words.join(separator),
  total:(offset,...numbers) => numbers.reduce((sum,n) => sum+Number(n),Number(offset))
};
function route([command,...args]) {
  const handler = handlers[command];
  return handler ? handler(...args) : 'missing';
}
const instructions = [['join','-','a','b','c'],['total',10,2,3],['other']];
console.log(JSON.stringify(instructions.map(route)));
