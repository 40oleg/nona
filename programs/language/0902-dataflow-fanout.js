function fanout(...sinks) {
  return value => sinks.forEach(sink => sink(value));
}
let sum = 0, count = 0; const labels = [];
const consume = fanout(
  ({value}) => { sum += value; count++; },
  ({label,value}) => labels.push(label+'='+value)
);
for (const [label,value] of [['a',2],['b',5],['c',1]]) consume({label,value:value*2});
console.log(JSON.stringify({sum,count,labels}));
