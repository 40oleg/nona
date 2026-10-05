const distance = new Proxy({ meters: 1200 }, {
  get(target, key) {
    if (key === "kilometers") return target.meters / 1000;
    if (key === "centimeters") return target.meters * 100;
    return Reflect.get(target, key);
  },
  set(target, key, value) { if (key === "kilometers") { target.meters = value * 1000; return true; } return Reflect.set(target, key, value); }
});
distance.kilometers = 2.5;
console.log(JSON.stringify([distance.meters, distance.kilometers, distance.centimeters]));
