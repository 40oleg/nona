const movements = [20,-8,-19,12,-3];
const history = [];
let lowest = 15;
const final = movements.reduce((balance,delta) => {
  const next = balance + delta;
  history.push(next);
  lowest = Math.min(lowest,next);
  return next;
},15);
console.log(JSON.stringify({history,lowest,final}));
