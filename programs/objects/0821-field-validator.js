class FormValidator {
  constructor(rules) { this.rules = rules; }
  validate(form) {
    return Object.entries(this.rules).flatMap(([field, checks]) => checks.filter(check => !check.test(form[field])).map(check => field + ":" + check.message));
  }
}
const validator = new FormValidator({
  name: [{ test: v => typeof v === "string" && v.trim().length > 0, message: "required" }],
  age: [{ test: v => Number.isInteger(v), message: "integer" }, { test: v => v >= 18, message: "adult" }]
});
console.log(JSON.stringify([validator.validate({ name: "", age: 17.5 }), validator.validate({ name: "Ada", age: 21 })]));
