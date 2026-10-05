const text = "{[()](]}";
const opening = new Set(["(","[","{"]);
const match = new Map([[")","("],["]","["],["}","{"]]);
const stack = [];
let error = -1;
for (let i=0;i<text.length;i++) {
  if (opening.has(text[i])) stack.push(text[i]);
  else if (match.has(text[i]) && stack.pop()!==match.get(text[i])) { error=i; break; }
}
const valid = error===-1 && stack.length===0;
console.log(JSON.stringify({valid,error,remaining:stack.join("")}));
