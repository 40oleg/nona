class Result {
  constructor(value,error = null) { this.value = value; this.error = error; }
  then(fn) {
    if (this.error) return this;
    try { return new Result(fn(this.value)); }
    catch(error) { return new Result(null,error.message); }
  }
}
const good = new Result('4').then(Number).then(n => n*3);
const bad = new Result(0).then(n => { if (!n) throw new Error('zero'); return 10/n; }).then(n => n+1);
console.log(JSON.stringify({good,bad}));
