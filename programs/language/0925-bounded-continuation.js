function sumFrom(n,total = 0) {
  return n === 0 ? {done:true,value:total} : {done:false,next:() => sumFrom(n-1,total+n)};
}
function trampoline(task) {
  let step = task;
  while (!step.done) { const {next} = step; step = next(); }
  return step.value;
}
const result = trampoline(sumFrom(20));
console.log(result);
console.log(trampoline(sumFrom(0,5)));
