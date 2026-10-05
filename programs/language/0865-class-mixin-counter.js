const labeled = Base => class extends Base {
  constructor(label,...args) { super(...args); this.label = label; }
  describe() { return this.label+'='+this.value; }
};
class Counter {
  constructor(value) { this.value = value; }
  add(amount) { this.value += amount; return this; }
}
const Meter = labeled(Counter);
const meter = new Meter('steps',3).add(4).add(-1);
console.log(meter.describe());
console.log(JSON.stringify({value:meter.value,isCounter:meter instanceof Counter}));
