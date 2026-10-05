const log = [];
const sensor = new Proxy({ temperature: 18, humidity: 42 }, {
  get(target, key, receiver) {
    log.push(String(key));
    return Reflect.get(target, key, receiver);
  }
});
const sum = sensor.temperature + sensor.humidity;
const { temperature } = sensor;
console.log(JSON.stringify([sum, temperature, log]));
