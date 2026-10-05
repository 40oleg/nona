class Worker {
  constructor(options) { this.options = {...options}; }
  clone(overrides) { return new Worker({...this.options,...overrides}); }
  run({name,cost}) { return name+':'+cost*this.options.factor; }
}
const original = new Worker({factor:2,label:'base'});
const clone = original.clone({factor:3});
const task = {name:'pack',cost:4};
console.log(original.run(task));
console.log(clone.run(task));
console.log(JSON.stringify(clone.options));
