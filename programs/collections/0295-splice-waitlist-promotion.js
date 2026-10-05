const confirmed = ["Ada","Bo","Cy","Dee"];
const waiting = ["Eli","Fay","Gus"];
const cancellations = ["Bo","Dee"];
const replaced = [];
for (const name of cancellations) {
  const index = confirmed.indexOf(name);
  if (index!==-1 && waiting.length) {
    const next = waiting.shift();
    confirmed.splice(index,1,next);
    replaced.push([name,next]);
  }
}
console.log(JSON.stringify({confirmed,waiting,replaced}));
