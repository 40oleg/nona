class Predicate {
  constructor(test) { this.test = test; }
  and(other) { return new Predicate(value => this.test(value) && other.test(value)); }
  or(other) { return new Predicate(value => this.test(value) || other.test(value)); }
  not() { return new Predicate(value => !this.test(value)); }
  select(values) { return values.filter(this.test); }
}
const adult = new Predicate(person => person.age >= 18), active = new Predicate(person => person.active);
const people = [{ name: "A", age: 20, active: true }, { name: "B", age: 12, active: true }, { name: "C", age: 30, active: false }];
console.log(JSON.stringify(adult.and(active).select(people).map(person => person.name)));
