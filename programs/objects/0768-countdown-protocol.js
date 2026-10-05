class Countdown {
  constructor(start) { this.current = start; }
  next() {
    if (this.current < 0) return { done: true };
    return { value: this.current--, done: false };
  }
  [Symbol.iterator]() { return this; }
}
const countdown = new Countdown(3);
const first = countdown.next().value;
console.log(JSON.stringify([first, [...countdown], countdown.next().done]));
