const workers = [[0, 0], [0, 1]], tasks = [5, 2, 4, 1, 3], plan = [];
for (let i = 0; i < tasks.length; i++) {
  workers.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const [start, worker] = workers[0];
  plan.push([i, worker, start]); workers[0][0] += tasks[i];
}
const makespan = Math.max(...workers.map(w => w[0]));
console.log(makespan + ':' + JSON.stringify(plan));
