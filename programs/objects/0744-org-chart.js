class Employee {
  constructor(name) { this.name = name; this.manager = null; this.reports = []; }
  supervise(employee) { employee.manager = this; this.reports.push(employee); }
  get chain() { return this.manager ? [...this.manager.chain, this.name] : [this.name]; }
  *team() { yield this.name; for (const report of this.reports) yield* report.team(); }
}
const director = new Employee("D"), lead = new Employee("L"), engineer = new Employee("E");
director.supervise(lead); lead.supervise(engineer);
console.log(JSON.stringify([engineer.chain, [...director.team()]]));
