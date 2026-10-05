const events = [["x","open"],["y","open"],["x","closed"],["x","open"],["y","closed"]];
const states = new Map();
let reopened = 0;
for (const [ticket,next] of events) {
  if (states.get(ticket) === "closed" && next === "open") reopened++;
  states.set(ticket,next);
}
const open = Array.from(states).filter(pair => pair[1] === "open").map(pair => pair[0]);
open.sort();
console.log(JSON.stringify({open,reopened}));
