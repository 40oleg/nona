const stream = [4,1,9,3,8,7,2,10];
const top = [];
const history = [];
for (const value of stream) {
  top.push(value);
  top.sort((a,b)=>b-a);
  if (top.length>3) top.pop();
  history.push(top.join(","));
}
console.log(JSON.stringify({top,history}));
