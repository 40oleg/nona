class Tank {
  #volume;
  constructor(capacity, volume) { this.capacity = capacity; this.#volume = volume; }
  transferTo(other, requested) {
    const amount = Math.min(requested, this.#volume, other.capacity - other.#volume);
    this.#volume -= amount; other.#volume += amount; return amount;
  }
  get volume() { return this.#volume; }
}
const source = new Tank(10, 9), destination = new Tank(6, 2);
console.log(JSON.stringify([source.transferTo(destination, 7), source.volume, destination.volume, source.transferTo(destination, 1)]));
