class Elevator {
  #requests = new Set();
  constructor(floor) { this.floor = floor; }
  request(floor) { if (floor !== this.floor) this.#requests.add(floor); }
  serve() {
    const stops = [...this.#requests].sort((a, b) => Math.abs(a - this.floor) - Math.abs(b - this.floor) || a - b);
    this.#requests.clear();
    if (stops.length) this.floor = stops[stops.length - 1]; return stops;
  }
}
const elevator = new Elevator(3); for (const floor of [7, 2, 5, 2]) elevator.request(floor);
console.log(JSON.stringify([elevator.serve(), elevator.floor, elevator.serve()]));
