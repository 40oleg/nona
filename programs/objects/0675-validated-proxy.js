const failures = [];
const profile = new Proxy({ age: 20 }, {
  set(target, key, value, receiver) {
    if (key === "age" && (!Number.isInteger(value) || value < 0)) {
      failures.push(value);
      return true;
    }
    return Reflect.set(target, key, value, receiver);
  }
});
profile.age = -2;
profile.age = 31;
console.log(JSON.stringify([profile.age, failures]));
