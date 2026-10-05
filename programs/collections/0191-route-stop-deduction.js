const route = ["pier","market","park","library","station"];
const closed = new Set(["market","library"]);
const active = route.filter(stop => !closed.has(stop));
const legs = active.map((stop,index) => {
  const previous = index === 0 ? "start" : active[index-1];
  return previous + "->" + stop;
});
const skipped = route.length - active.length;
const result = {legs,skipped};
console.log(JSON.stringify(result));
