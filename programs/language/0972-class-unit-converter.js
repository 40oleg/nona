class Converter {
  constructor(factors) { this.factors = factors; }
  convert({amount,unit},target) {
    const from = this.factors[unit], to = this.factors[target];
    if (from === undefined || to === undefined) throw new Error('unit');
    return {amount:amount*from/to,unit:target};
  }
}
const length = new Converter({m:1,cm:0.01,mm:0.001});
console.log(JSON.stringify(length.convert({amount:25,unit:'cm'},'mm')));
try { length.convert({amount:1,unit:'m'},'yard'); } catch(error) { console.log(error.message); }
