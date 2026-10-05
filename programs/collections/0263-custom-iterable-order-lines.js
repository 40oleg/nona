const order = {
  lines:[{qty:2,price:3},{qty:4,price:5}],
  [Symbol.iterator]() {
    let index = 0;
    const lines = this.lines;
    return {next() {
      if (index===lines.length) return {done:true};
      const line = lines[index++];
      return {value:line.qty*line.price,done:false};
    }};
  }
};
const totals = Array.from(order);
console.log(JSON.stringify([totals,totals.reduce((a,b)=>a+b,0)]));
