class Dispatcher {
  #cursor = 0;
  constructor(workers) { this.workers = workers; }
  dispatch(job) {
    const worker = this.workers[this.#cursor++ % this.workers.length];
    worker.jobs.push(job); return worker.name;
  }
  toJSON() { return this.workers; }
}
const dispatcher = new Dispatcher([{ name: "A", jobs: [] }, { name: "B", jobs: [] }]);
const assigned = ["j1", "j2", "j3", "j4", "j5"].map(job => dispatcher.dispatch(job));
console.log(JSON.stringify([assigned, dispatcher]));
