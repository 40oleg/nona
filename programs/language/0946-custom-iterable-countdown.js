class Countdown {
  constructor(start) { this.value = start; }
  [Symbol.iterator]() { return this; }
  next() {
    if (this.value < 0) return {done:true};
    return {value:this.value--,done:false};
  }
}
const counter = new Countdown(3);
const {value:first} = counter.next();
console.log(JSON.stringify({first,remaining:[...counter],finished:counter.next().done}));
