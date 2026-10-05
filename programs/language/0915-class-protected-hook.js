class Processor {
  transform(value) { return value; }
  run(rows) { return rows.map(({id,value}) => ({id,value:this.transform(value)})); }
}
class Clamp extends Processor {
  constructor(limit) { super(); this.limit = limit; }
  transform(value) { return Math.min(this.limit,Math.max(0,value)); }
}
const processor = new Clamp(5);
console.log(JSON.stringify(processor.run([{id:'a',value:-2},{id:'b',value:9},{id:'c',value:3}])));
console.log(processor instanceof Processor);
