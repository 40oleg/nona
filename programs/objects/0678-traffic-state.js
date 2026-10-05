class Signal {
  #state = "red";
  static next = { red: "green", green: "amber", amber: "red" };
  advance() { this.#state = Signal.next[this.#state]; return this; }
  get state() { return this.#state; }
  get canDrive() { return this.#state === "green"; }
}
const signal = new Signal();
const trace = [];
for (let i = 0; i < 5; i++) trace.push([signal.advance().state, signal.canDrive]);
console.log(JSON.stringify(trace));
