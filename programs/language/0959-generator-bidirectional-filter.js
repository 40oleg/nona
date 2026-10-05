function* accepted(values) {
  let minimum = 0;
  for (const value of values) {
    if (value >= minimum) minimum = (yield value) ?? minimum;
  }
  return minimum;
}
const source = accepted([1,2,5,3,8]);
const first = source.next();
const second = source.next(4);
const third = source.next(7);
const {value:final,done} = source.next();
console.log(JSON.stringify({first:first.value,second:second.value,third:third.value,final,done}));
