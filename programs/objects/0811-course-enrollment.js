class Course {
  #students = new Set();
  #waiting = [];
  constructor(capacity) { this.capacity = capacity; }
  enroll(name) { if (this.#students.has(name) || this.#waiting.includes(name)) return "duplicate"; if (this.#students.size < this.capacity) { this.#students.add(name); return "enrolled"; } this.#waiting.push(name); return "waiting"; }
  drop(name) { if (this.#students.delete(name) && this.#waiting.length) this.#students.add(this.#waiting.shift()); }
  toJSON() { return { students: [...this.#students], waiting: this.#waiting }; }
}
const course = new Course(2);
const results = ["A", "B", "C", "A"].map(name => course.enroll(name)); course.drop("B");
console.log(JSON.stringify([results, course]));
