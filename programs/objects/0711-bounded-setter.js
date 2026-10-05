const gauge = {
  _value: 0,
  set value(input) { this._value = Math.min(100, Math.max(0, input)); },
  get value() { return this._value; }
};
const readings = [];
for (const input of [-10, 45, 120]) {
  gauge.value = input;
  readings.push(gauge.value);
}
console.log(JSON.stringify(readings));
