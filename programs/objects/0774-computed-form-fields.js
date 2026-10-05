const fields = ["first", "last", "email"];
const form = Object.fromEntries(fields.map(name => [name, ""]));
for (const [key, value] of [["first", "Ada"], ["last", "Lane"], ["email", "a@b"]]) Reflect.set(form, key, value);
Object.defineProperty(form, "display", {
  get() { return this.first + " " + this.last; },
  enumerable: true
});
const missing = fields.filter(key => !form[key]);
console.log(JSON.stringify({
  form,
  missing
}));
