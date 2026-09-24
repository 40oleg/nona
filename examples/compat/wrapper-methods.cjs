console.log(true.valueOf(), false.toString(), "abc".valueOf(), "abc".toString());
let box = {}.valueOf;
console.log(box.call(7).valueOf(), box.call("ab").toString(), box.call(true).toString());
let values = [0, -0, 255, -255, 0.1, 1.1, 5e-324, 1e30, Infinity, NaN];
for (let i = 0; i < values.length; i++) {
  console.log(values[i].toString(2), values[i].toString(3), values[i].toString(16), values[i].toString(36));
}
console.log((255).toString("16"), (255).toString(16.9), (255).toString(undefined));
let hex = (0).toString.bind(65535, 16);
console.log(hex(), (0).toString.name, (0).toString.length, (0).toString.toString());
