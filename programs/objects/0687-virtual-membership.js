const catalog = new Proxy({ apple: 3, orange: 5 }, {
  has(target, key) { return Object.hasOwn(target, key) && target[key] <= 3; },
  get(target, key) { return key === "cheap" ? Object.keys(target).filter(k => k in catalog) : Reflect.get(target, key); }
});
const availability = [];
for (const key of ["apple", "orange", "pear"]) availability.push(key in catalog);
console.log(JSON.stringify({
  availability,
  cheap: catalog.cheap,
  orangePrice: catalog.orange
}));
