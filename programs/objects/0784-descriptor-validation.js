const employee = {};
let salary = 0;
Object.defineProperties(employee, {
  name: { value: "Lin", enumerable: true },
  salary: {
    enumerable: true,
    get() { return salary; },
    set(value) { if (!Number.isInteger(value) || value < 0) throw new RangeError("invalid salary"); salary = value; }
  }
});
employee.salary = 100;
let rejected = false; try { employee.salary = -1; } catch (error) { rejected = error instanceof RangeError; }
console.log(JSON.stringify([employee, rejected, Reflect.set(employee, "name", "Max")]));
