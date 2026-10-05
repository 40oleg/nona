const demand = [3,1,4,2,5];
const next = new Array(demand.length).fill(-1);
const stack = [];
for (let day=0;day<demand.length;day++) {
  while (stack.length && demand[stack[stack.length-1]]<demand[day]) {
    const previous = stack.pop();
    next[previous]=day;
  }
  stack.push(day);
}
console.log(JSON.stringify(next));
