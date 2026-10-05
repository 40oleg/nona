const parent = { get greeting() { return "Hi " + this.name; } };
const child = Object.create(parent);
child.name = "Lin";
const alternate = { name: "Max" };
console.log(JSON.stringify({
  inherited: child.greeting,
  explicit: Reflect.get(parent, "greeting", alternate),
  descriptor: typeof Object.getOwnPropertyDescriptor(parent, "greeting").get,
  own: Object.hasOwn(child, "greeting")
}));
