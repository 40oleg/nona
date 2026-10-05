function* summarize(values,width) {
  const tail = []; let total = 0;
  for (const value of values) {
    total += value; tail.push(value);
    if (tail.length > width) tail.shift();
    yield {total,tail:[...tail]};
  }
}
const summaries = [...summarize([2,5,1,4],2)];
const {total,tail} = summaries[summaries.length-1];
console.log(JSON.stringify({summaries,total,tail}));
