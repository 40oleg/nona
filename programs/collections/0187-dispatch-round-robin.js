const workers = ["Ada","Bo","Cy"];
const tasks = ["a","b","c","d","e","f","g"];
const assigned = new Map(workers.map(name => [name,[]]));
let cursor = 0;
for (const task of tasks) {
  assigned.get(workers[cursor]).push(task);
  cursor = (cursor + 1) % workers.length;
}
const loads = Array.from(assigned).map(([name,list]) => name+":"+list.join(""));
console.log(loads.join("|"));
