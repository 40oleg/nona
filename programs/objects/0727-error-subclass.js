class CapacityError extends Error {
  constructor(limit, requested) {
    super("requested " + requested + " exceeds " + limit);
    this.name = "CapacityError"; this.limit = limit;
  }
  toJSON() { return { name: this.name, message: this.message, limit: this.limit }; }
}
const result = [];
try { throw new CapacityError(3, 8); }
catch (error) { result.push(error instanceof Error, error); }
console.log(JSON.stringify(result));
