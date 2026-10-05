const limits = new Map([["SAVE",2],["TEN",1]]);
const requests = ["SAVE","TEN","SAVE","SAVE","MISS","TEN"];
const accepted = [];
const rejected = [];
for (const code of requests) {
  const remaining = limits.get(code) || 0;
  if (remaining>0) { limits.set(code,remaining-1); accepted.push(code); }
  else rejected.push(code);
}
const remaining = Array.from(limits);
console.log(JSON.stringify({accepted,rejected,remaining}));
