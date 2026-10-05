const defaults = { retries: 3, mode: "safe", limit: 10 };
class Job {
  constructor(name, overrides) { this.name = name; this.policy = Object.assign(Object.create(defaults), overrides); }
  plan(workload) { return { name: this.name, batches: Math.ceil(workload / this.policy.limit), attempts: this.policy.retries + 1, mode: this.policy.mode }; }
  restoreDefault(key) { delete this.policy[key]; }
}
const job = new Job("import", { retries: 0, limit: 4 });
const before = job.plan(9);
job.restoreDefault("limit");
defaults.mode = "fast";
console.log(JSON.stringify([before, job.plan(9), Object.keys(job.policy)]));
