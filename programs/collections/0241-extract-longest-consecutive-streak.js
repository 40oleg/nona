const checks = [true,true,false,true,true,true,false,true];
let current = 0;
let best = {start:0,length:0};
for (let i=0;i<checks.length;i++) {
  current = checks[i] ? current+1 : 0;
  if (current>best.length) best={start:i-current+1,length:current};
}
const streak = checks.slice(best.start,best.start+best.length);
const failures = checks.filter(value => !value).length;
console.log(JSON.stringify({best,streak,failures}));
