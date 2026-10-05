class Gauge {
  constructor(limit) { this.limit = limit; this._value = 0; }
  get value() { return this._value; }
  set value(next) { if (next < 0 || next > this.limit) throw new Error('range'); this._value = next; }
}
class PercentGauge extends Gauge { constructor() { super(100); } describe() { return this.value+'%'; } }
const gauge = new PercentGauge();
gauge.value = 75;
try { gauge.value = 120; } catch(error) { console.log(error.message); }
console.log(gauge.describe());
console.log(gauge.value);
