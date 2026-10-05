const prototype = {
  set upper(value) { this.stored = value.toUpperCase(); },
  get upper() { return this.stored; }
};
const first = Object.create(prototype);
const second = Object.create(prototype);
Reflect.set(prototype, "upper", "one", first);
second.upper = "two";
console.log(JSON.stringify([
  first.upper, second.upper, Object.hasOwn(prototype, "stored")
]));
