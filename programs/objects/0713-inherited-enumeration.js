const base = { inherited: "base", shared: 1 };
const object = Object.create(base);
object.own = "local";
object.shared = 2;
const all = [];
for (const key in object) all.push([key, object[key], Object.hasOwn(object, key)]);
console.log(JSON.stringify({
  all,
  own: Object.entries(object),
  parent: Object.getPrototypeOf(object).inherited
}));
